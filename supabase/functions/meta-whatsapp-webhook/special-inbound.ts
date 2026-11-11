// Mensagens que a Meta entrega sem conteúdo útil (erro 131051) ou que são só avisos.
// Testes em special-inbound.test.ts.
//
// - skip: não vira mensagem na conversa (continua no registro de entrada).
// - notice: vira um aviso legível; triggerAi diz se a IA deve responder.

export type SpecialInbound =
  | { action: "skip"; reason: string }
  | { action: "notice"; content: string; triggerAi: boolean };

export const UNREADABLE_NOTICE =
  "⚠️ Mensagem que o WhatsApp não deixa ver aqui (por exemplo: código de verificação, " +
  "foto de visualização única ou enquete). Peça para reenviar por texto.";

// deno-lint-ignore no-explicit-any
export function classifySpecialInbound(msg: any): SpecialInbound | null {
  const type = msg?.type;

  // Reação removida chega sem emoji.
  if (type === "reaction" && !msg?.reaction?.emoji) {
    return { action: "skip", reason: "reaction_removed" };
  }

  if (type === "system") {
    const sys = msg?.system ?? {};
    if (sys.type === "user_changed_number") {
      const novo = sys.wa_id ? ` para +${String(sys.wa_id).replace(/^\+/, "")}` : "";
      return { action: "notice", content: `🔁 O cliente trocou de número${novo}.`, triggerAi: false };
    }
    return {
      action: "notice",
      content: `ℹ️ Aviso do WhatsApp${sys.body ? `: ${sys.body}` : "."}`,
      triggerAi: false,
    };
  }

  if (type === "unsupported") {
    const sub = msg?.unsupported?.type;
    // As fotos do álbum chegam depois, uma a uma; o aviso do álbum é só barulho.
    if (sub === "album") return { action: "skip", reason: "album" };
    if (sub === "revoke") {
      return { action: "notice", content: "🚫 O cliente apagou uma mensagem.", triggerAi: false };
    }
    if (sub === "edit") {
      return {
        action: "notice",
        content: "✏️ O cliente editou uma mensagem. O WhatsApp não envia o texto novo para o sistema.",
        triggerAi: false,
      };
    }
    return { action: "notice", content: UNREADABLE_NOTICE, triggerAi: true };
  }

  return null;
}
