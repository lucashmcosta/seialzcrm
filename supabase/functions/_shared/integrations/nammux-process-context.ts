// Processos do cliente vindos do Nammux, para o agente de atendimento responder com dado real.
// Lê só o que a integração já grava (nammux_process_snapshots, via nammux-webhook-ingest).
// Fica na integração: o núcleo do Seialz não conhece o Nammux.

export interface NammuxProcessRow {
  cnj: string | null;
  process_title: string | null;
  phase: string | null;
  stage_name: string | null;
  status_name: string | null;
  status_changed_at: string | null;
  responsible_name: string | null;
  distributed_at: string | null;
  source_updated_at: string | null;
  last_synced_at: string | null;
}

function day(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Bloco do prompt com os processos. Vazio quando não há processo do Nammux. */
export function nammuxProcessBlock(rows: NammuxProcessRow[]): string {
  if (!rows.length) return "";
  const lines = rows.map((r, i) => {
    const parts = [
      `${i + 1}. ${r.process_title || "Processo"}`,
      r.cnj ? `número ${r.cnj}` : "ainda sem número (não distribuído)",
      r.stage_name ? `etapa: ${r.stage_name}` : null,
      r.status_name ? `situação: ${r.status_name}` : null,
      day(r.status_changed_at) ? `desde ${day(r.status_changed_at)}` : null,
      day(r.distributed_at) ? `distribuído em ${day(r.distributed_at)}` : null,
      r.responsible_name ? `responsável no escritório: ${r.responsible_name}` : null,
      day(r.source_updated_at ?? r.last_synced_at) ? `atualizado no sistema em ${day(r.source_updated_at ?? r.last_synced_at)}` : null,
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  });
  return `
## PROCESSOS DO CLIENTE (sistema do escritório)
${lines.join("\n")}
Use só estes dados para falar do processo. Se o cliente perguntar algo que não está aqui (data de audiência, link, valor, pagamento, movimentação do tribunal), não invente: diga o que você sabe e passe para a equipe.
`;
}

export async function loadNammuxProcesses(supabase: any, organizationId: string, contactId: string): Promise<NammuxProcessRow[]> {
  const { data: opps } = await supabase.from("opportunities").select("id")
    .eq("organization_id", organizationId).eq("contact_id", contactId).is("deleted_at", null).limit(20);
  const opportunityIds = (opps ?? []).map((o: { id: string }) => o.id);
  if (!opportunityIds.length) return [];
  const { data, error } = await supabase.from("nammux_process_snapshots")
    .select("cnj, process_title, phase, stage_name, status_name, status_changed_at, responsible_name, distributed_at, source_updated_at, last_synced_at")
    .eq("organization_id", organizationId)
    .in("opportunity_id", opportunityIds)
    .order("source_updated_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (error) {
    console.warn("[nammux-process-context] não leu os processos", error.message);
    return [];
  }
  return (data ?? []) as NammuxProcessRow[];
}
