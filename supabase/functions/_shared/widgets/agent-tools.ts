// Ferramentas que um widget dá ao agente de IA (vale para todas as orgs).
//
// O agente (ai-agent-respond) não conhece nenhum widget: ele só usa as ferramentas desta lista
// que estiverem ligadas no agente E cujo widget estiver ligado na org (organization_widgets).
// O que é de um negócio (por exemplo, a calculadora trabalhista) mora na pasta do widget.
// No navegador, a mesma ferramenta aparece no assistente do agente por `agentTools` em
// src/widgets/registry.ts.

import type { InteractivePayload } from "../whatsapp-interactive.ts";
import { laborCenterAgentTool } from "./labor-center/agent-tool.ts";
import { plamevAgentTools } from "./plamev-quote/agent-tools.ts";

type SupabaseLike = { from: (table: string) => any; storage: any };

export interface WidgetToolContext {
  supabase: SupabaseLike;
  organizationId: string;
  isTestMode: boolean;
  /** A conversa que o agente está lendo (no modo de teste, a do teste). */
  history: Array<{ role: string; content: string }>;
  /** O contato da conversa. Ausente no modo de teste sem contato: a ferramenta não grava nada. */
  contactId?: string | null;
  /** Configuração desta ferramenta no agente (`ai_agents.tool_settings[nome da ferramenta]`), se houver. */
  settings?: unknown;
}

/** Imagem ou documento (URL pública) que a ferramenta manda ao cliente. A legenda é o que fica no histórico. */
export interface WidgetClientMedia {
  url: string;
  type: "image" | "document";
  caption?: string | null;
}

export interface WidgetToolOutcome {
  /** O que volta para o modelo. */
  modelMessage: string;
  /** Mensagem pronta que vai ao cliente depois do texto do agente. */
  clientText?: string | null;
  /** Arquivos prontos que vão ao cliente depois do texto do agente e da mensagem da ferramenta. */
  clientMedia?: WidgetClientMedia[] | null;
  /** Nota interna para a equipe, gravada depois que a mensagem do cliente sai. */
  teamNote?: string | null;
  /** Pergunta com botões que vai ao cliente depois do texto do agente (no lugar de send_choices). */
  clientInteractive?: InteractivePayload | null;
}

export interface WidgetAttachment {
  mediaType: string | null;
  content: string | null;
  mediaUrls: unknown;
}

export interface WidgetAgentTool {
  /** Chave do widget em organization_widgets. */
  widgetKey: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Instrução que entra no prompt quando a ferramenta está ativa. */
  prompt: string;
  run(args: unknown, ctx: WidgetToolContext): WidgetToolOutcome | Promise<WidgetToolOutcome>;
  /** Lê um anexo do cliente e devolve um texto curto para o agente, sem dado sensível, ou null. */
  readAttachment?(attachment: WidgetAttachment, ctx: { supabase: SupabaseLike }): Promise<string | null>;
}

export const WIDGET_AGENT_TOOLS: WidgetAgentTool[] = [laborCenterAgentTool, ...plamevAgentTools];

export const WIDGET_TOOL_NAMES = new Set(WIDGET_AGENT_TOOLS.map((t) => t.name));

/** As ferramentas de widget ligadas no agente, só das que têm o widget ligado na org. */
export async function activeWidgetTools(supabase: SupabaseLike, organizationId: string, enabledTools: string[]): Promise<WidgetAgentTool[]> {
  const wanted = WIDGET_AGENT_TOOLS.filter((t) => enabledTools.includes(t.name));
  if (!wanted.length) return [];
  const { data } = await supabase.from("organization_widgets").select("widget_key")
    .eq("organization_id", organizationId).eq("is_enabled", true)
    .in("widget_key", [...new Set(wanted.map((t) => t.widgetKey))]);
  const on = new Set(((data ?? []) as Array<{ widget_key: string }>).map((r) => r.widget_key));
  return wanted.filter((t) => on.has(t.widgetKey));
}

/** Instruções das ferramentas ativas, para o prompt do agente. */
export function widgetToolsPrompt(tools: WidgetAgentTool[]): string {
  return tools.map((t) => t.prompt).join("");
}
