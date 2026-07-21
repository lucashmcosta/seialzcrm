// Shared vCard parser used by the Evolution webhook when processing
// `contactMessage` and `contactsArrayMessage` payloads from Baileys.
//
// Goal: produce the exact same shape already consumed by
// `MetaRichMessageContent` (`contacts[]` with `name`, `phones`, `emails`) so
// the existing UI renders shared contacts without any Evolution-specific
// component.
//
// Reference: RFC 6350 (vCard 4.0) and Baileys usually emits vCard 3.0.

export interface RichContactName {
  formatted_name?: string;
  first_name?: string;
  last_name?: string;
}

export interface RichContactPhone {
  phone?: string;   // display / E.164 attempt
  wa_id?: string;   // WhatsApp id (no "+")
  type?: string;    // CELL / WORK / HOME / ...
}

export interface RichContactEmail {
  email?: string;
  type?: string;
}

export interface RichContact {
  name?: RichContactName;
  phones?: RichContactPhone[];
  emails?: RichContactEmail[];
  org?: string;
  vcard?: string;   // preserved raw vCard body
}

// --- vCard line unfolding + parsing -----------------------------------------
// vCard folds long lines with CRLF followed by a whitespace char. We must
// join them back before parsing.
function unfoldVCard(raw: string): string[] {
  const lines: string[] = [];
  const src = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of src) {
    if (line.length === 0) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

interface VCardLine {
  name: string;                       // e.g. "TEL"
  params: Record<string, string[]>;   // e.g. { TYPE: ["CELL"], waid: ["55..."] }
  value: string;                      // raw value (unescaped semicolons kept)
}

function parseVCardLine(line: string): VCardLine | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);

  const parts = left.split(";");
  const name = (parts.shift() ?? "").toUpperCase();
  const params: Record<string, string[]> = {};
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 0) {
      // legacy vCard 2.1 shorthand: "CELL" instead of "TYPE=CELL"
      const key = "TYPE";
      (params[key] = params[key] ?? []).push(p.toUpperCase());
    } else {
      const k = p.slice(0, eq).toUpperCase();
      const v = p.slice(eq + 1);
      (params[k] = params[k] ?? []).push(v);
    }
  }
  return { name, params, value };
}

function firstType(params: Record<string, string[]>): string | undefined {
  const t = params.TYPE?.find((s) => !!s);
  return t ? t.toUpperCase() : undefined;
}

// Attempt to build an E.164-ish display for a phone number using either an
// explicit `waid` parameter or by cleaning the value.
function normalizePhoneDisplay(rawValue: string, waid?: string): { phone: string; wa_id?: string } {
  const digits = rawValue.replace(/[^\d]/g, "");
  const waDigits = waid ? waid.replace(/[^\d]/g, "") : "";
  const wa_id = waDigits || undefined;
  // Prefer wa_id when present (Baileys always fills it correctly).
  const source = wa_id || digits;
  if (!source) return { phone: rawValue.trim(), wa_id };
  return { phone: "+" + source, wa_id };
}

export function parseVCard(vcard: string): RichContact {
  const lines = unfoldVCard(vcard);
  const contact: RichContact = { vcard, phones: [], emails: [] };

  for (const raw of lines) {
    const line = parseVCardLine(raw);
    if (!line) continue;

    switch (line.name) {
      case "FN": {
        contact.name = { ...(contact.name ?? {}), formatted_name: line.value.trim() };
        break;
      }
      case "N": {
        // N:Last;First;Middle;Prefix;Suffix
        const seg = line.value.split(";");
        const last = (seg[0] ?? "").trim();
        const first = (seg[1] ?? "").trim();
        contact.name = {
          ...(contact.name ?? {}),
          last_name: last || undefined,
          first_name: first || undefined,
        };
        break;
      }
      case "TEL": {
        const { phone, wa_id } = normalizePhoneDisplay(
          line.value,
          line.params.WAID?.[0] || line.params.waid?.[0],
        );
        contact.phones!.push({ phone, wa_id, type: firstType(line.params) ?? "CELL" });
        break;
      }
      case "EMAIL": {
        const email = line.value.trim();
        if (email) contact.emails!.push({ email, type: firstType(line.params) });
        break;
      }
      case "ORG": {
        contact.org = line.value.replace(/;/g, " ").trim();
        break;
      }
    }
  }

  // Ensure formatted_name has something usable
  if (contact.name && !contact.name.formatted_name) {
    const composed = [contact.name.first_name, contact.name.last_name]
      .filter(Boolean).join(" ").trim();
    if (composed) contact.name.formatted_name = composed;
  }

  if ((contact.phones?.length ?? 0) === 0) delete contact.phones;
  if ((contact.emails?.length ?? 0) === 0) delete contact.emails;

  return contact;
}

// Normalises a Baileys `contactMessage` / `contactsArrayMessage` payload
// into the same shape produced by Meta Cloud (`{ type: 'contacts', contacts:[...] }`).
export function normalizeBaileysContact(
  contactMessage: Record<string, unknown> | null | undefined,
): RichContact | null {
  if (!contactMessage || typeof contactMessage !== "object") return null;
  const vcardStr = typeof contactMessage.vcard === "string" ? contactMessage.vcard : null;
  const displayName = typeof contactMessage.displayName === "string"
    ? contactMessage.displayName
    : null;

  const parsed: RichContact = vcardStr ? parseVCard(vcardStr) : {};
  if (displayName && !parsed.name?.formatted_name) {
    parsed.name = { ...(parsed.name ?? {}), formatted_name: displayName };
  }
  if (!parsed.name && !parsed.phones && !parsed.emails && !displayName) return null;
  if (!parsed.name && displayName) parsed.name = { formatted_name: displayName };
  return parsed;
}

export function normalizeBaileysContactsArray(
  contactsArrayMessage: Record<string, unknown> | null | undefined,
): RichContact[] {
  if (!contactsArrayMessage) return [];
  const list = (contactsArrayMessage.contacts as unknown[]) ?? [];
  const out: RichContact[] = [];
  for (const item of list) {
    const c = normalizeBaileysContact(item as Record<string, unknown>);
    if (c) out.push(c);
  }
  const dn = typeof contactsArrayMessage.displayName === "string"
    ? contactsArrayMessage.displayName : null;
  if (out.length === 0 && dn) out.push({ name: { formatted_name: dn } });
  return out;
}
