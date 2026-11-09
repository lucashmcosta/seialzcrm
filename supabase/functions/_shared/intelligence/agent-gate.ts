// Quando o agente pode responder uma conversa, e o que fazer com a mensagem recebida.
export interface AgentThreadState {
  ai_agent_id: string | null;
  ai_agent_released_at: string | null;
  needs_human_attention: boolean | null;
  assigned_user_id: string | null;
}

export type AgentGate = "respond" | "human_owns" | "take_over";

export function decideAgentGate(thread: AgentThreadState | null, agentId: string, humanReplied: boolean): AgentGate {
  if (!thread || thread.ai_agent_id !== agentId || thread.ai_agent_released_at) return "human_owns";
  if (humanReplied || thread.assigned_user_id || thread.needs_human_attention) return "take_over";
  return "respond";
}

export type AgentInput = "text" | "audio" | "unsupported_media";

/** O agente escuta áudio; imagem, vídeo e documento ainda vão para uma pessoa. */
export function agentInputKind(mediaType: string | null | undefined): AgentInput {
  if (!mediaType) return "text";
  return mediaType.toLowerCase().startsWith("audio") ? "audio" : "unsupported_media";
}

export const AGENT_HANDOFF_ACK = "Recebi! Vou passar para uma pessoa da nossa equipe conferir, e ela continua com você aqui mesmo.";
