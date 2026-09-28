// ============================================================================
// Capacidade do Composer fora da janela 24h.
//
// NÃO escolhe endpoint. Com "Responder por" ligado, consome o endpoint final
// já produzido por `deriveSelectedEndpoint` (via `useManualReplyEndpoint`:
// manual → última mensagem válida → padrão da rota). Com a feature desligada,
// devolve exatamente a capacidade legada de `useThreadSendEndpoint`.
//
// Fail-closed: seletor não pronto, endpoint não resolvido, endpoint fora da
// lista carregada ou capacidade ausente ⇒ exige template.
// Sem checagem de provedor: só `requires_template_outside_window`.
// ============================================================================

export interface ComposerCapabilityInput {
  manualReply: {
    enabled: boolean;
    uiState: string;
    /** resultado final de deriveSelectedEndpoint */
    selectedEndpointId: string | null;
  };
  /** caminho legado (useThreadSendEndpoint) */
  legacyRequiresTemplateOutsideWindow: boolean;
  endpointById: Record<string, { requires_template_outside_window?: boolean | null } | undefined>;
}

export function resolveComposerCapability(input: ComposerCapabilityInput): {
  endpointId: string | null;
  requiresTemplateOutsideWindow: boolean;
} {
  const { manualReply, legacyRequiresTemplateOutsideWindow, endpointById } = input;
  if (!manualReply.enabled) {
    return { endpointId: null, requiresTemplateOutsideWindow: legacyRequiresTemplateOutsideWindow };
  }
  const id = manualReply.selectedEndpointId;
  if (manualReply.uiState !== 'ready' || !id) {
    return { endpointId: id ?? null, requiresTemplateOutsideWindow: true };
  }
  const flag = endpointById[id]?.requires_template_outside_window;
  return { endpointId: id, requiresTemplateOutsideWindow: flag !== false };
}
