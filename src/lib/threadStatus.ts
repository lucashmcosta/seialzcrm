// Etiqueta da conversa na lista: mostra de quem é a vez, pela última mensagem.
// O status salvo só muda quando uma pessoa responde pelo CRM; mensagens do agente de IA
// ou enviadas pelo celular não mudam. Por isso a etiqueta olha a última mensagem.
export type ThreadStatusKey = 'reply' | 'awaiting_client' | 'open' | 'in_progress' | 'resolved' | 'closed';

export function displayThreadStatus(status: string | null | undefined, lastDirection: string | null | undefined): string {
  if (status === 'resolved' || status === 'closed') return status;
  if (lastDirection === 'inbound') return 'reply';
  if (lastDirection === 'outbound') return 'awaiting_client';
  return status || 'open';
}
