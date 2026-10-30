/**
 * Templates de categoria AUTHENTICATION (OTP) só podem ser enviados pelo
 * sistema — nunca escolhidos por um atendente em envio manual.
 * Filtra pela CATEGORIA, não pelo template_type.
 */
export function isManualSendableTemplate(t: { category?: string | null }): boolean {
  return (t.category ?? '').trim().toUpperCase() !== 'AUTHENTICATION';
}
