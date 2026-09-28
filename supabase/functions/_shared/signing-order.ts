/** Stable topological order. Shared verbatim with the Seialz integration. */
export interface OrderParticipant { ref: string; signing_mode?: string; }
export interface OrderDocument { signing_order?: string; participant_refs: string[]; }
export function resolveSigningOrder(parts: OrderParticipant[], docs: OrderDocument[]) {
  const refs = parts.map(p => p.ref);
  const edges = new Map(refs.map(r => [r, new Set<string>()]));
  const manual = parts.filter(p => p.signing_mode !== "automatic").map(p => p.ref);
  const add = (a: string, b: string) => {
    if (!edges.has(a) || !edges.has(b)) throw new Error("unknown_participant_ref");
    if (a !== b) edges.get(a)!.add(b);
  };
  for (const d of docs) {
    const list = [...new Set(d.participant_refs)];
    if (d.signing_order === "sequential") {
      for (let i = 1; i < list.length; i++) add(list[i - 1], list[i]);
    } else {
      for (const r of list) if (parts.find(p => p.ref === r)?.signing_mode === "automatic") {
        for (const m of manual) add(m, r);
      }
    }
  }
  const remaining = new Set(refs), ordered: string[] = [];
  while (remaining.size) {
    const next = refs.find(r => remaining.has(r) && ![...remaining].some(s => edges.get(s)!.has(r)));
    if (!next) throw new Error("signing_order_conflict");
    ordered.push(next); remaining.delete(next);
  }
  return { refs: ordered, signing_order: docs.some(d => d.signing_order === "sequential") ? "sequential" : "parallel" };
}
