// ============================================================================
// Capacidade do Composer fora da janela 24h.
//
// NÃO escolhe endpoint. Com "Responder por" ligado, consome a opção final já
// produzida por `deriveSelectedEndpoint` (via `useManualReplyEndpoint`:
// manual → última mensagem válida → padrão da rota) e lê a capacidade dessa
// mesma opção. Com a feature desligada, devolve exatamente a capacidade
// legada de `useThreadSendEndpoint`.
//
// Fail-closed: seletor não pronto (loading/erro), opção ausente ou
// capacidade diferente de `false` ⇒ exige template.
// Sem checagem de provedor: só `requires_template_outside_window`.
// ============================================================================

export interface ComposerCapabilityInput {
  manualReply: {
    enabled: boolean;
    uiState: string;
    /** resultado final de deriveSelectedEndpoint */
    selectedEndpointId: string | null;
    selectedOption: { endpointId: string; requiresTemplateOutsideWindow: boolean | null } | null;
  };
  /** caminho legado (useThreadSendEndpoint) */
  legacyRequiresTemplateOutsideWindow: boolean;
}

export function resolveComposerCapability(input: ComposerCapabilityInput): {
  endpointId: string | null;
  requiresTemplateOutsideWindow: boolean;
} {
  const { manualReply, legacyRequiresTemplateOutsideWindow } = input;
  if (!manualReply.enabled) {
    return { endpointId: null, requiresTemplateOutsideWindow: legacyRequiresTemplateOutsideWindow };
  }
  const id = manualReply.selectedEndpointId;
  const opt = manualReply.selectedOption;
  if (manualReply.uiState !== 'ready' || !id || !opt || opt.endpointId !== id) {
    return { endpointId: id ?? null, requiresTemplateOutsideWindow: true };
  }
  return { endpointId: id, requiresTemplateOutsideWindow: opt.requiresTemplateOutsideWindow !== false };
}
