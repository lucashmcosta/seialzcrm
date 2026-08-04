// Evolution API — Normalização de estado de conexão.
//
// Fonte única de verdade para traduzir o vocabulário do servidor Evolution
// (Baileys) nos quatro estados canônicos do Seialz. Usado pelo webhook
// (CONNECTION_UPDATE) e pelo health check periódico, para que ambos
// persistam exatamente o mesmo rótulo em `evolution_instances`.
//
// Contexto (auditoria 04/08/2026): o servidor enviou `refused` (statusReason
// 428, limite de QR atingido) e a versão anterior do mapeamento caía em
// `unknown`, escondendo o fato de que a instância estava sem sessão.
// Estados terminais — sessão inexistente ou invalidada — devem virar `close`.

import { EvolutionConnectionState } from "./types.ts";

const OPEN = new Set(["open", "connected"]);
const CONNECTING = new Set(["connecting", "qr", "qrcode", "pairing", "syncing"]);
const CLOSE = new Set([
  "close",
  "closed",
  "disconnected",
  "logout",
  "logged_out",
  "loggedout",
  "refused", // sessão recusada pelo WhatsApp (ex.: limite de QR, 428)
  "banned",
  "conflict",
  "replaced", // sessão substituída por outro dispositivo
  "unpaired",
  "failure",
  "error",
]);

/**
 * Traduz um estado bruto do servidor Evolution para um estado canônico.
 * Retorna `null` quando não há valor utilizável (caller decide o que fazer);
 * retorna `unknown` quando há valor, mas ele não é reconhecido.
 */
export function normalizeEvolutionState(
  raw: unknown,
): EvolutionConnectionState | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (OPEN.has(s)) return "open";
  if (CONNECTING.has(s)) return "connecting";
  if (CLOSE.has(s)) return "close";
  return "unknown";
}
