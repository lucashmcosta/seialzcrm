/** Nota nula/vazia vinda do Nammux (entrevista que confirmou tudo) vira texto padrão. */
export function notaCertificacao(note: unknown, interviewer: string): string {
  const texto = typeof note === "string" ? note.trim().slice(0, 1000) : "";
  return texto || `Certificado na entrevista por ${interviewer}`;
}

/** Chave única de `nammux_sync_events` (constraint nammux_sync_events_external_unique). */
export const INBOUND_LOG_CONFLICT = "organization_id,direction,external_event_id";

/**
 * O retrato que chegou é mais velho do que o que já está gravado?
 *
 * A comparação de datas só vale entre retratos do MESMO processo. Um negócio
 * pode passar a ser representado por outro processo (o caso foi arquivado e
 * ajuizado de novo, com outro número): aí as datas são de processos diferentes
 * e não dizem qual é mais recente. Troca de processo é sempre aceita — quem
 * decide qual processo representa o negócio é o Nammux.
 */
export function retratoDesatualizado(
  atual: { source_updated_at?: string | null; external_process_id?: string | null } | null | undefined,
  recebido: { sourceUpdatedAt: string | null; externalProcessId: string },
): boolean {
  if (!atual?.source_updated_at || !recebido.sourceUpdatedAt) return false;
  if (atual.external_process_id && atual.external_process_id !== recebido.externalProcessId) return false;
  return new Date(recebido.sourceUpdatedAt).getTime() < new Date(atual.source_updated_at).getTime();
}
