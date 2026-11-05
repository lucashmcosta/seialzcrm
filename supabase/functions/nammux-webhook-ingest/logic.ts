/** Nota nula/vazia vinda do Nammux (entrevista que confirmou tudo) vira texto padrão. */
export function notaCertificacao(note: unknown, interviewer: string): string {
  const texto = typeof note === "string" ? note.trim().slice(0, 1000) : "";
  return texto || `Certificado na entrevista por ${interviewer}`;
}
