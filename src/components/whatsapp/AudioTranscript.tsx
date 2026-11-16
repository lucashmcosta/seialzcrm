// Transcrição embaixo do player de áudio, aberta ao clicar. O texto mora em audio_transcriptions: a mensagem
// continua com "[Áudio]". Áudio inaudível fica sem texto, então aqui não aparece nada.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { loadTranscript } from '@/lib/audioTranscriptBatch';
import { uiText, useUiLocale } from '@/lib/ui-locale';

const POLL_MS = 10_000;
const MAX_POLLS = 4; // áudio recém-chegado costuma ser transcrito em segundos

export function AudioTranscript({ messageId }: { messageId: string }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['audio-transcript', messageId],
    staleTime: 5 * 60_000,
    // Sem linha ainda: tenta mais um pouco. Linha vazia (filtrada) já é resposta final.
    refetchInterval: (query) =>
      query.state.data === null && query.state.dataUpdateCount <= MAX_POLLS ? POLL_MS : false,
    queryFn: () => loadTranscript(messageId),
  });

  const text = data?.trim();
  if (!text) return null;

  return (
    <div className="mt-1 px-1 pb-0.5 text-xs">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center gap-0.5 text-[11px] font-medium opacity-70 hover:opacity-100"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
        {uiText('Transcrição')}
      </button>
      {open && <p className="mt-0.5 whitespace-pre-wrap break-words opacity-90">{text}</p>}
    </div>
  );
}
