import type { Call } from '@twilio/voice-sdk';

/**
 * Configurações compartilhadas de telefonia — válidas para TODAS as organizações.
 *
 * Seialz é multi-tenant: nada aqui pode ser definido por empresa/org específica.
 * Mantenha também uma visão agnóstica de provedor — estas são as preferências
 * de mídia do lado do cliente (WebRTC), não regras de negócio de nenhum tenant.
 */

/**
 * Ordem de preferência de codec do Voice SDK, do mais para o menos preferido.
 *
 * Opus antes de PCMU: recomendação oficial do Twilio — o Opus tem melhor
 * qualidade usando menos banda, o que é especialmente perceptível em redes
 * móveis/instáveis (Opus ~40 kbps vs PCMU ~100 kbps e mais tolerante a perda de
 * pacote). Fonte única para não haver divergência entre os pontos de
 * inicialização do `Device` (inbound, outbound, modal).
 *
 * Recebe o enum `Codec` que o chamador já tem em escopo (via import estático ou
 * dinâmico do SDK) para que este módulo não precise importar — nem carregar
 * estaticamente — o pacote `@twilio/voice-sdk`.
 */
export function voiceCodecPreferences(
  codec: { Opus: Call.Codec; PCMU: Call.Codec },
): Call.Codec[] {
  return [codec.Opus, codec.PCMU];
}
