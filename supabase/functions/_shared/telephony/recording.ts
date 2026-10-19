// Resolve se a ligação deve ser gravada, combinando a configuração do NÚMERO
// com a da PESSOA que está na ligação.
//
// O número é compartilhado (a Central Trabalhista tem um só para 20 pessoas),
// então a flag do número sozinha é tudo-ou-nada. A coluna
// organization_phone_number_users.recording_enabled sobrepõe por pessoa:
//
//     NULL  -> segue o número
//     true  -> grava, mesmo com o número desligado
//     false -> não grava, mesmo com o número ligado
//
// É UMA consulta indexada por (phone_number_id, user_id). Ela entra no caminho
// do TwiML, que é síncrono para o Twilio, por isso: sem usuário não consulta, e
// qualquer erro cai para a flag do número em vez de derrubar a ligação.

// deno-lint-ignore no-explicit-any
export async function resolveRecordingEnabled(
  admin: any,
  number: { id?: string; recording_enabled?: boolean | null } | null,
  userId?: string | null,
): Promise<boolean> {
  const doNumero = number?.recording_enabled === true;
  if (!userId || !number?.id) return doNumero;
  try {
    const { data, error } = await admin
      .from("organization_phone_number_users")
      .select("recording_enabled")
      .eq("phone_number_id", number.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return doNumero;
    const daPessoa = data?.recording_enabled;
    return daPessoa === null || daPessoa === undefined
      ? doNumero
      : daPessoa === true;
  } catch {
    // Nunca deixar a resolução de gravação impedir a ligação de acontecer.
    return doNumero;
  }
}

/** Atributos de gravação do <Dial>, ou string vazia quando não se grava. */
export function recordingAttrs(
  enabled: boolean,
  recordingCallbackUrl: string,
): string {
  return enabled
    ? ` record="record-from-answer-dual" recordingStatusCallback="${recordingCallbackUrl}"`
    : "";
}
