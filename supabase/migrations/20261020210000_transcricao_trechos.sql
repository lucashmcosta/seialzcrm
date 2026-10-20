-- Os trechos da transcricao, com falante e tempo.
--
-- O texto corrido serve para ler. Nao serve para o que vem a seguir: a
-- entrevista vai deixar de ser anotada a mao e passar a sair da transcricao,
-- e aí cada resposta precisa apontar para o MOMENTO em que foi dita -- senao
-- a transcricao e so a palavra de um modelo contra a de uma pessoa, e sobre
-- ela se decide comissao.
--
-- Guardar agora e barato. Depois seria migracao mais retranscrever tudo.

alter table public.call_recordings
  add column if not exists transcription_segments jsonb;

comment on column public.call_recordings.transcription_segments is
  'Trechos da transcricao: [{"inicio": 12.4, "fim": 15.1, "falante": "atendente", "texto": "..."}]. '
  'O falante vem do CANAL do audio (gravacao dual), nao de palpite do modelo: canal 0 e quem atendeu. '
  'Os tempos permitem tocar o audio no ponto exato de cada resposta.';

create index if not exists call_recordings_com_trechos_idx
  on public.call_recordings ((transcription_segments is not null))
  where transcription_segments is not null;
