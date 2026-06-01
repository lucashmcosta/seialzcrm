// Fase 1.3C — Composer read-only da Inbox.
// NÃO envia mensagem. NÃO chama twilio-whatsapp-send. NÃO faz POST.
// Existe apenas para deixar explícito ao operador onde a resposta vai aparecer
// quando o canal dedicado de Atendimento estiver configurado.

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PaperPlaneTilt, LockSimple } from '@phosphor-icons/react';

export function InboxComposer() {
  return (
    <div className="border-t border-border bg-muted/30 px-6 py-3 flex-shrink-0">
      <div className="flex items-start gap-2 mb-2 text-[11px] text-muted-foreground">
        <LockSimple size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
        <div className="leading-tight">
          <p className="text-foreground font-medium">
            Envio indisponível: este número é compartilhado com o Comercial.
          </p>
          <p>Aguardando configuração segura do canal de Atendimento. Conversa em modo somente leitura.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Textarea
          placeholder="Responder…"
          rows={2}
          disabled
          aria-disabled
          readOnly
          className="flex-1 resize-none bg-background/50 cursor-not-allowed"
        />
        <Button size="icon" disabled aria-disabled className="cursor-not-allowed">
          <PaperPlaneTilt className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
