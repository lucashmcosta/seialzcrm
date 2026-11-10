// Converte uma mensagem interativa num rascunho de modelo para a Meta aprovar.
// Lista não vira modelo (a Meta não aceita lista em template); botões viram respostas
// rápidas; botão de link vira botão de URL.
import type { InteractivePayload } from '../../supabase/functions/_shared/whatsapp-interactive';

export interface InteractiveTemplateDraft {
  body: string;
  header: string;
  footer: string;
  templateType: 'quick-reply' | 'call-to-action';
  buttons: { id: string; title: string }[];
  actions: { type: 'url'; title: string; value: string }[];
}

export const TEMPLATE_DRAFT_STATE_KEY = 'interactiveTemplateDraft';

export function canBecomeTemplate(p: InteractivePayload): boolean {
  return p.kind === 'buttons' || p.kind === 'cta_url';
}

export function interactiveToTemplateDraft(p: InteractivePayload): InteractiveTemplateDraft | null {
  const base = { body: p.body.trim(), header: (p.header ?? '').trim(), footer: (p.footer ?? '').trim() };
  if (p.kind === 'buttons') {
    return { ...base, templateType: 'quick-reply', buttons: p.buttons.map((b, i) => ({ id: b.id || `btn_${i + 1}`, title: b.title.trim() })), actions: [] };
  }
  if (p.kind === 'cta_url') {
    return { ...base, templateType: 'call-to-action', buttons: [], actions: [{ type: 'url', title: p.displayText.trim(), value: p.url.trim() }] };
  }
  return null;
}
