// Ferramenta do agente de IA: gerar o contrato da cliente e mandar para assinatura (SuvSign V2).
//
// Serve para qualquer org: o agente só tem a ferramenta se ela estiver ligada nele
// (enabled_tools) e configurada em tool_settings.send_contract (modelos da SuvSign).
// Usa o MESMO envio da tela (função signature-requests, chamada interna em nome do responsável
// pela oportunidade) e a MESMA verificação de CPF (registry-lookup). Nada é reimplementado aqui.
//
// Ordem: oportunidade aberta → dados do cadastro → CPF verificado (o nome oficial entra no
// cadastro) → campos personalizados da oportunidade que a cliente informou → preparar → enviar →
// link de assinatura para a cliente. Qualquer coisa fora do caminho volta para o modelo como
// instrução curta: pedir o que falta, uma vez, ou passar para a equipe.
// Quando a cliente assina, o webhook da SuvSign marca a oportunidade como ganha.

import type { WidgetAgentTool, WidgetToolOutcome } from "../widgets/agent-tools.ts";
import { decidePersonNameMatch } from "../registry/name-match.ts";

export const SEND_CONTRACT_TOOL = "send_contract";

export interface ContractToolSettings {
  template_ids: string[];
  /** Quem aparece como autor do contrato quando a oportunidade não tem dono ativo. */
  responsible_user_id: string | null;
  /** Etapa para onde a oportunidade vai quando o contrato sai (ex.: "Contrato enviado"). */
  sent_stage_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContractSettings(raw: unknown): ContractToolSettings | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = (Array.isArray(r.template_ids) ? r.template_ids : typeof r.template_id === "string" ? [r.template_id] : [])
    .filter((x): x is string => typeof x === "string" && !!x.trim() && x.length <= 100).map((x) => x.trim());
  if (!ids.length) return null;
  const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  return { template_ids: [...new Set(ids)], responsible_user_id: uuidOrNull(r.responsible_user_id), sent_stage_id: uuidOrNull(r.sent_stage_id) };
}

/** "15/07/2026", "15/07/26", "15-07-2026" ou "2026-07-15" → "2026-07-15". Data inválida → null. */
export function parseBrDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/);
    if (!match) return null;
    d = +match[1]; m = +match[2]; y = +match[3];
    if (match[3].length === 2) y += y > (new Date().getFullYear() % 100) + 1 ? 1900 : 2000;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  label: string | null;
  field_type: string;
  options: unknown;
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const optionValues = (def: CustomFieldDef) =>
  (((def.options as { options?: Array<{ value?: string; label?: string }> } | null)?.options) ?? [])
    .map((o) => ({ value: String(o.value ?? o.label ?? ""), label: String(o.label ?? o.value ?? "") }))
    .filter((o) => o.value);

/**
 * Campos personalizados da oportunidade que o modelo preencheu → valores para gravar.
 * Só entram campos que existem na org; lista só aceita uma das opções; data vira AAAA-MM-DD.
 */
export function opportunityFieldValues(defs: CustomFieldDef[], input: unknown) {
  const values: Array<{ def: CustomFieldDef; value: string | number | boolean }> = [];
  const problems: string[] = [];
  const given = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const [name, raw] of Object.entries(given)) {
    const def = defs.find((d) => d.name === name);
    if (!def || raw == null || String(raw).trim() === "") continue;
    const label = def.label || def.name;
    if (def.field_type === "select") {
      const opts = optionValues(def);
      const hit = opts.find((o) => fold(o.value) === fold(String(raw)) || fold(o.label) === fold(String(raw)));
      if (hit) values.push({ def, value: hit.value });
      else problems.push(`${label} precisa ser um destes: ${opts.map((o) => o.label).join(", ")}`);
    } else if (def.field_type === "date") {
      const iso = parseBrDate(raw);
      if (iso) values.push({ def, value: iso });
      else problems.push(`${label} precisa ser uma data (dia, mês e ano)`);
    } else if (def.field_type === "number") {
      const n = Number(String(raw).replace(",", "."));
      if (Number.isFinite(n)) values.push({ def, value: n });
      else problems.push(`${label} precisa ser um número`);
    } else if (def.field_type === "boolean") {
      values.push({ def, value: /^(s|sim|true|1|yes)$/i.test(String(raw).trim()) });
    } else {
      values.push({ def, value: String(raw).replace(/\s+/g, " ").trim().slice(0, 300) });
    }
  }
  return { values, problems };
}

/** Definição da ferramenta para o modelo, com os campos da oportunidade que a org tem. */
export function contractToolParameters(defs: CustomFieldDef[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const d of defs) {
    const opts = optionValues(d).map((o) => o.label);
    const kind = d.field_type === "date" ? " Data: dia/mês/ano." : opts.length ? ` Uma destas: ${opts.join(", ")}.` : "";
    props[d.name] = { type: "string", description: `${d.label || d.name}.${kind}` };
  }
  return {
    type: "object",
    properties: {
      birth_date: {
        type: "string",
        description: "Data de nascimento da cliente (dia/mês/ano). Só mande quando a ferramenta pedir: o CPF quase sempre já traz a data.",
      },
      opportunity_fields: {
        type: "object",
        description: "Dados do caso que a cliente já contou na conversa e que o contrato usa. Preencha só o que ela disse; não invente.",
        properties: props,
      },
    },
  };
}

/** Resultado da consulta de CPF (registry-lookup) → o que fazer. */
export type CpfOutcome =
  | { kind: "verified"; officialName: string | null }
  | { kind: "need_birth_date" }
  | { kind: "birth_date_mismatch" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: string };

export function cpfOutcome(status: number, body: any, sentBirthDate: boolean): CpfOutcome {
  if (body?.ok === true) {
    const name = String(body?.data?.name ?? body?.data?.full_name ?? body?.data?.nome ?? "").trim();
    return { kind: "verified", officialName: name || null };
  }
  const error = String(body?.error ?? "");
  if (error === "birth_date_required" || body?.fallback_available === true) return { kind: "need_birth_date" };
  if (["not_found", "invalid_or_not_found"].includes(error)) {
    // Com data informada, "não encontrado" no SERPRO é CPF e data que não batem.
    return sentBirthDate ? { kind: "birth_date_mismatch" } : { kind: "not_found" };
  }
  return { kind: "unavailable", reason: error || `http_${status}` };
}

const PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);
/** "MARIA DA SILVA" → "Maria da Silva" (o nome oficial vem em maiúsculas). */
export function titleCaseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim().split(" ")
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

// ---------------------------------------------------------------------------------------------
// Execução (dependências injetadas para testar sem banco nem rede)
// ---------------------------------------------------------------------------------------------

export interface ContractToolDeps {
  isTestMode: boolean;
  settings: ContractToolSettings | null;
  opportunityFieldDefs: CustomFieldDef[];
  /** Oportunidade aberta mais recente do contato. */
  openOpportunity(): Promise<{ id: string; owner_user_id: string | null } | null>;
  /** Envio já existente desta oportunidade (o mais recente). */
  existingRequest(opportunityId: string): Promise<{ id: string; status: string } | null>;
  contact(): Promise<{ full_name: string | null; cpf: string | null; email: string | null; address_zip: string | null; address_number: string | null; address_street: string | null } | null>;
  cpfVerified(): Promise<boolean>;
  /** Membro ativo da org com e-mail válido (autor do contrato na SuvSign). */
  isUsableAuthor(userId: string): Promise<boolean>;
  verifyCpf(input: { cpf: string; birthDate: string | null; actingUserId: string }): Promise<{ status: number; body: any }>;
  updateContactName(fullName: string): Promise<void>;
  saveOpportunityFields(opportunityId: string, values: Array<{ def: CustomFieldDef; value: string | number | boolean }>): Promise<void>;
  callSignature(body: Record<string, unknown>): Promise<{ status: number; body: any }>;
  clientParticipantId(requestId: string): Promise<string | null>;
  moveToStage(opportunityId: string, stageId: string): Promise<void>;
}

const HANDOFF = "Não gere o contrato de novo: passe para a equipe (transfer_to_human) dizendo no resumo";

export async function runSendContract(args: any, deps: ContractToolDeps): Promise<WidgetToolOutcome> {
  if (!deps.settings) {
    return { modelMessage: `A ferramenta de contrato não está configurada. ${HANDOFF} que a cliente quer contratar e os dados estão no cadastro.` };
  }
  const opp = await deps.openOpportunity();
  if (!opp) return { modelMessage: `Não achei uma oportunidade aberta desta cliente. ${HANDOFF} "contrato: sem oportunidade aberta".` };

  // Autor do contrato: o dono da oportunidade; sem dono usável, o responsável configurado.
  const author = deps.isTestMode ? "test"
    : opp.owner_user_id && await deps.isUsableAuthor(opp.owner_user_id) ? opp.owner_user_id
    : deps.settings.responsible_user_id && await deps.isUsableAuthor(deps.settings.responsible_user_id) ? deps.settings.responsible_user_id
    : null;
  if (!author) return { modelMessage: `Não há uma pessoa responsável para assinar o envio do contrato. ${HANDOFF} "contrato: sem responsável".` };

  // Já enviado: manda o link de novo em vez de gerar outro contrato.
  const existing = await deps.existingRequest(opp.id);
  if (existing && ["sent", "in_progress"].includes(existing.status)) {
    if (deps.isTestMode) return { modelMessage: "Modo de teste: o contrato já teria sido enviado; o link iria de novo." };
    const link = await signingLink(existing.id, deps, author);
    return link
      ? { modelMessage: "O contrato já tinha sido enviado. O link vai de novo logo depois da sua mensagem: diga em uma frase curta que é só abrir e assinar. Não escreva o link.", clientText: linkText(link) }
      : { modelMessage: `O contrato já foi enviado, mas não consegui o link agora. Diga que o contrato também chegou no e-mail dela. Se ela não achar, ${HANDOFF.toLowerCase()} "reenviar link do contrato".` };
  }
  if (existing?.status === "completed") {
    return { modelMessage: "O contrato desta cliente já foi assinado. Não gere outro. Agradeça e diga que a equipe segue com os próximos passos." };
  }

  const contact = await deps.contact();
  const missing: string[] = [];
  if (!String(contact?.full_name ?? "").trim()) missing.push("nome completo");
  if (!String(contact?.cpf ?? "").trim()) missing.push("CPF");
  if (!String(contact?.email ?? "").trim()) missing.push("e-mail");
  if (!String(contact?.address_zip ?? "").trim()) missing.push("CEP");
  if (!String(contact?.address_number ?? "").trim()) missing.push("número da casa");
  if (String(contact?.address_zip ?? "").trim() && !String(contact?.address_street ?? "").trim()) missing.push("nome da rua");
  if (missing.length) {
    return { modelMessage: `Antes do contrato falta: ${missing.join(", ")}. Peça só isso, grave com save_registration_data e chame send_contract de novo.` };
  }

  const { values, problems } = opportunityFieldValues(deps.opportunityFieldDefs, args?.opportunity_fields);
  if (problems.length) return { modelMessage: `Problema nos dados do caso: ${problems.join("; ")}. Corrija pelo que ela contou (ou pergunte, uma vez) e chame send_contract de novo.` };

  if (deps.isTestMode) {
    return { modelMessage: "Modo de teste: o CPF seria conferido e o contrato gerado e enviado agora; o link de assinatura iria logo depois da sua mensagem. Diga em uma frase curta que o contrato está pronto e que ela lê com calma e assina pelo celular." };
  }

  // CPF verificado (exigido para o ganho). O nome oficial entra no cadastro se bater com o que ela mandou.
  if (!(await deps.cpfVerified())) {
    const birthDate = args?.birth_date ? parseBrDate(args.birth_date) : null;
    if (args?.birth_date && !birthDate) return { modelMessage: "A data de nascimento não está completa. Peça dia, mês e ano, uma vez, e chame send_contract de novo com birth_date." };
    const res = await deps.verifyCpf({ cpf: String(contact!.cpf).replace(/\D/g, ""), birthDate, actingUserId: author });
    const out = cpfOutcome(res.status, res.body, !!birthDate);
    if (out.kind === "need_birth_date") {
      return { modelMessage: "Para conferir o CPF preciso da data de nascimento da cliente. Peça a data de nascimento dela (dia, mês e ano), em uma frase, e chame send_contract de novo com birth_date." };
    }
    if (out.kind === "birth_date_mismatch") {
      return { modelMessage: `O CPF e a data de nascimento não batem. Peça para ela conferir os dois, uma vez (grave o CPF com save_registration_data). Se continuar, ${HANDOFF.toLowerCase()} "CPF não conferiu".` };
    }
    if (out.kind === "not_found") {
      return { modelMessage: `Esse CPF não foi encontrado. Peça para ela conferir o CPF, uma vez, grave com save_registration_data e chame send_contract de novo. Se continuar, ${HANDOFF.toLowerCase()} "CPF não encontrado".` };
    }
    if (out.kind === "unavailable") {
      return { modelMessage: `Não consegui conferir o CPF agora. ${HANDOFF} "contrato: conferir CPF e enviar".` };
    }
    if (out.officialName) {
      const match = decidePersonNameMatch(contact!.full_name, out.officialName);
      if (match.decision === "review") {
        return { modelMessage: `O nome que ela mandou não confere com o nome desse CPF. Não diga o nome do CPF. ${HANDOFF} "nome não confere com o CPF".` };
      }
      // Mesmo nome (só muda acento ou maiúscula): fica como ela escreveu, que tem os acentos.
      // Nome diferente mas compatível (ex.: faltava um sobrenome): entra o oficial.
      if (match.decision !== "exact") await deps.updateContactName(titleCaseName(out.officialName));
    }
  }

  if (values.length) await deps.saveOpportunityFields(opp.id, values);

  const prep = await deps.callSignature({ action: "prepare_contract", opportunity_id: opp.id, template_ids: deps.settings.template_ids, acting_user_id: author });
  if (prep.status >= 300 || !prep.body?.request_id) {
    const err = String(prep.body?.error ?? "");
    if (err === "missing_contact_fields" || err === "unresolved_template_variables") {
      const what = String(prep.body?.message ?? "").replace(/^[^:]*:\s*/, "");
      return { modelMessage: `O contrato precisa de: ${what}. Se for algo que ela já contou ou pode responder, pergunte uma vez e chame send_contract de novo (dados do caso em opportunity_fields). Senão, ${HANDOFF.toLowerCase()} "contrato: falta ${what}".` };
    }
    console.warn("[send_contract] prepare", { status: prep.status, error: err });
    return { modelMessage: `Não consegui gerar o contrato agora. ${HANDOFF} "contrato: erro ao gerar (${err || prep.status})".` };
  }
  const requestId = String(prep.body.request_id);
  const sent = await deps.callSignature({ action: "send_for_signature", request_id: requestId, acting_user_id: author });
  if (sent.status >= 300) {
    console.warn("[send_contract] send", { status: sent.status, error: sent.body?.error });
    return { modelMessage: `O contrato foi gerado, mas não consegui enviar. ${HANDOFF} "contrato: erro ao enviar (${sent.body?.error ?? sent.status})".` };
  }
  if (deps.settings.sent_stage_id) await deps.moveToStage(opp.id, deps.settings.sent_stage_id);

  const link = await signingLink(requestId, deps, author);
  return link
    ? {
      modelMessage: "Contrato gerado e enviado. O link de assinatura vai para a cliente logo depois da sua mensagem: não escreva o link. Diga em uma frase curta que o contrato está pronto e que ela lê com calma e assina pelo celular. Não passe para a equipe agora.",
      clientText: linkText(link),
      teamNote: "Contrato enviado pelo agente para assinatura (SuvSign). Quando a cliente assinar, a oportunidade vai para Ganho.",
    }
    : {
      modelMessage: "Contrato gerado e enviado para o e-mail dela. Diga em uma frase curta que o contrato chegou no e-mail e que ela lê com calma e assina pelo celular. Não escreva link.",
      teamNote: "Contrato enviado pelo agente (SuvSign, por e-mail). O link para WhatsApp não saiu; se ela não achar o e-mail, reenvie o link pela oportunidade.",
    };
}

async function signingLink(requestId: string, deps: ContractToolDeps, actingUserId: string): Promise<string | null> {
  const participantId = await deps.clientParticipantId(requestId);
  if (!participantId) return null;
  const r = await deps.callSignature({ action: "get_signing_link", request_id: requestId, participant_id: participantId, acting_user_id: actingUserId });
  const url = String(r.body?.signing_url ?? "");
  return r.status < 300 && /^https:\/\//.test(url) ? url : null;
}

const linkText = (url: string) => `Aqui está o seu contrato para assinar: ${url}`;

// ---------------------------------------------------------------------------------------------
// Ferramenta montada para uma conversa (dependências reais)
// ---------------------------------------------------------------------------------------------

export interface ContractToolContext {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  organizationId: string;
  contactId: string | null;
  isTestMode: boolean;
  rawSettings: unknown;
  supabaseUrl: string;
  serviceKey: string;
}

export async function contractToolsForAgent(enabledTools: string[], ctx: ContractToolContext): Promise<WidgetAgentTool[]> {
  if (!enabledTools.includes(SEND_CONTRACT_TOOL)) return [];
  const { data: defs } = await ctx.supabase.from("custom_field_definitions")
    .select("id, name, label, field_type, options").eq("organization_id", ctx.organizationId).eq("module", "opportunities")
    .order("order_index", { ascending: true });
  const fieldDefs = ((defs ?? []) as CustomFieldDef[]).filter((d) => d.name);
  return [{
    widgetKey: "suvsign",
    name: SEND_CONTRACT_TOOL,
    description:
      "Gera o contrato da cliente e manda para ela assinar, com o link na conversa. Use quando o caso segue, ela disse que quer " +
      "contratar e os dados do contrato já estão gravados (save_registration_data). Confere o CPF antes de gerar.",
    parameters: contractToolParameters(fieldDefs),
    prompt: `
- **send_contract**: Quando a cliente quiser contratar e os dados do contrato estiverem gravados, use send_contract (no lugar de passar para a equipe preparar o contrato). Preencha opportunity_fields com o que ela já contou (ex.: se o bebê nasceu ou se está grávida, e a data). Siga o que a ferramenta responder: se pedir algo, peça só aquilo; se mandar passar para a equipe, passe. Depois que o contrato sair, diga em uma frase curta que ela lê com calma e assina pelo celular: o link vai sozinho.
`,
    run: (args) => runSendContract(args, realDeps(ctx, fieldDefs)),
  }];
}

function realDeps(ctx: ContractToolContext, fieldDefs: CustomFieldDef[]): ContractToolDeps {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const call = async (fn: string, body: Record<string, unknown>) => {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceKey}` },
      body: JSON.stringify({ organization_id: org, ...body }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return {
    isTestMode: ctx.isTestMode,
    settings: parseContractSettings(ctx.rawSettings),
    opportunityFieldDefs: fieldDefs,
    async openOpportunity() {
      if (!ctx.contactId) return null;
      const { data } = await db.from("opportunities").select("id, owner_user_id")
        .eq("organization_id", org).eq("contact_id", ctx.contactId).eq("status", "open").is("deleted_at", null)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async existingRequest(opportunityId) {
      const { data } = await db.from("signature_requests").select("id, status")
        .eq("organization_id", org).eq("opportunity_id", opportunityId).neq("status", "cancelled")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async contact() {
      if (!ctx.contactId) return null;
      const { data } = await db.from("contacts").select("full_name, cpf, email, address_zip, address_number, address_street")
        .eq("id", ctx.contactId).eq("organization_id", org).maybeSingle();
      return data ?? null;
    },
    async cpfVerified() {
      const { data } = await db.from("contact_identity_profiles").select("cpf_verification_status")
        .eq("organization_id", org).eq("contact_id", ctx.contactId).maybeSingle();
      return data?.cpf_verification_status === "verified";
    },
    async isUsableAuthor(userId) {
      const [{ data: u }, { data: m }] = await Promise.all([
        db.from("users").select("email").eq("id", userId).maybeSingle(),
        db.from("user_organizations").select("id").eq("user_id", userId).eq("organization_id", org).eq("is_active", true).maybeSingle(),
      ]);
      return !!m && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(u?.email ?? "").trim());
    },
    verifyCpf: ({ cpf, birthDate, actingUserId }) =>
      call("registry-lookup", { kind: "cpf", value: cpf, contact_id: ctx.contactId, acting_user_id: actingUserId, ...(birthDate ? { birth_date: birthDate } : {}) }),
    async updateContactName(fullName) {
      const [first, ...rest] = fullName.split(" ");
      const { error } = await db.from("contacts").update({ full_name: fullName, first_name: first, last_name: rest.join(" ") || null })
        .eq("id", ctx.contactId).eq("organization_id", org);
      if (error) console.warn("[send_contract] nome oficial não gravado", error.code);
    },
    async saveOpportunityFields(opportunityId, values) {
      const now = new Date().toISOString();
      const { error } = await db.from("custom_field_values").upsert(values.map(({ def, value }) => ({
        organization_id: org, module: "opportunities", record_id: opportunityId, field_definition_id: def.id, value, updated_at: now,
      })), { onConflict: "record_id,field_definition_id" });
      if (error) console.warn("[send_contract] campos da oportunidade", error.code);
    },
    callSignature: (body) => call("signature-requests", body),
    async clientParticipantId(requestId) {
      const { data: c } = await db.from("contacts").select("email").eq("id", ctx.contactId).maybeSingle();
      const { data: ps } = await db.from("signature_request_participants").select("id, ref, email, signing_mode").eq("request_id", requestId);
      const list = ((ps ?? []) as Array<{ id: string; ref: string | null; email: string | null; signing_mode: string | null }>)
        .filter((p) => p.signing_mode !== "automatic");
      const email = String(c?.email ?? "").trim().toLowerCase();
      // A cliente é quem tem o e-mail dela; com um signatário só, é ele.
      return (list.find((p) => email && String(p.email ?? "").trim().toLowerCase() === email)
        ?? (list.length === 1 ? list[0] : null))?.id ?? null;
    },
    async moveToStage(opportunityId, stageId) {
      const { data, error } = await db.rpc("transition_opportunity_stage_v1", {
        _organization_id: org, _opportunity_id: opportunityId, _target_stage_id: stageId,
        _close_date: null, _override: false, _override_reason: "", _source: "ai_agent_contract",
      });
      if (error || data?.ok === false) console.warn("[send_contract] etapa não aplicada", error?.code ?? data?.error);
    },
  };
}
