// Transcrição embaixo do player de áudio. O texto mora em audio_transcriptions: a mensagem
// continua com "[Áudio]". Áudio inaudível fica sem texto, então aqui não aparece nada.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uiText, useUiLocale } from '@/lib/ui-locale';

const COLLAPSE_AT = 280;
const POLL_MS = 10_000;
const MAX_POLLS = 4; // áudio recém-chegado costuma ser transcrito em segundos

export function AudioTranscript({ messageId }: { messageId: string }) {
  useUiLocale();
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ['audio-transcript', messageId],
    staleTime: 5 * 60_000,
    // Sem linha ainda: tenta mais um pouco. Linha vazia (filtrada) já é resposta final.
    refetchInterval: (query) =>
      query.state.data === null && query.state.dataUpdateCount <= MAX_POLLS ? POLL_MS : false,
    queryFn: async (): Promise<string | null> => {
      const { data: rows, error } = await supabase
        .from('audio_transcriptions')
        .select('transcript')
        .eq('message_id', messageId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return rows?.[0]?.transcript ?? null;
    },
  });

  const text = data?.trim();
  if (!text) return null;
  const long = text.length > COLLAPSE_AT;

  return (
    <div className="mt-1 px-1 pb-0.5 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-60">{uiText('Transcrição')}</p>
      <p className="whitespace-pre-wrap break-words opacity-90">
        {long && !expanded ? `${text.slice(0, COLLAPSE_AT).trimEnd()}…` : text}
      </p>
      {long && (
        <button type="button" className="mt-0.5 font-medium underline opacity-70" onClick={() => setExpanded((v) => !v)}>
          {expanded ? uiText('Ver menos') : uiText('Ver mais')}
        </button>
      )}
    </div>
  );
}
