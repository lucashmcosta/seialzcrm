import { useState } from 'react';
import { Pause, Play, Robot } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { agentPauseState, pauseUntil, type PauseChoice } from '@/lib/agentPause';

interface Props {
  threadId: string;
  agentId: string | null | undefined;
  pausedUntil: string | null | undefined;
  onChanged: () => void;
}

/** Pausa o agente de IA só nesta conversa (2 h, 24 h ou até reativar). */
export function AgentPauseControl({ threadId, agentId, pausedUntil, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  if (!agentId) return null;
  const state = agentPauseState(pausedUntil);

  const save = async (value: string | null, msg: string) => {
    setSaving(true);
    const { error } = await supabase.from('message_threads')
      .update({ ai_agent_paused_until: value } as never).eq('id', threadId);
    setSaving(false);
    if (error) { toast.error('Não foi possível mudar o agente nesta conversa.'); return; }
    toast.success(msg);
    onChanged();
  };

  if (state.paused) {
    return (
      <Button variant="outline" size="sm" disabled={saving} className="h-7 px-2.5 text-xs gap-1 flex-shrink-0"
        title={`O agente não responde nesta conversa ${state.label}.`}
        onClick={() => save(null, 'Agente reativado nesta conversa.')}>
        <Play size={14} weight="bold" /> Agente pausado {state.label} · Reativar
      </Button>
    );
  }

  const choose = (c: PauseChoice, label: string) => save(pauseUntil(c).toISOString(), `Agente pausado nesta conversa ${label}.`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={saving} className="h-7 px-2.5 text-xs gap-1 flex-shrink-0"
          title="Calar o agente de IA só nesta conversa">
          <Robot size={14} weight="bold" /> Pausar agente
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => choose('2h', 'por 2 horas')}><Pause size={14} className="mr-2" /> Por 2 horas</DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose('24h', 'por 24 horas')}><Pause size={14} className="mr-2" /> Por 24 horas</DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose('until_resume', 'até reativar')}><Pause size={14} className="mr-2" /> Até eu reativar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
