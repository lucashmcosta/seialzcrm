-- Áudio da gravação no Supabase Storage, com retenção.
--
-- Hoje o áudio fica no Twilio, e lá o armazenamento é cobrado por mês e é
-- CUMULATIVO: cada mês soma ao anterior. Medido em 19/10/2026, o volume da
-- Central Trabalhista (3.084 min/mês) daria ~US$46/mês só de armazenamento no
-- Twilio e crescendo, contra ~US$1 a 2/mês aqui.
--
-- `recording_url` CONTINUA guardando a URL do Twilio, para não perder a
-- procedência de onde o áudio veio. `storage_path` é onde ele passa a morar.

alter table public.call_recordings
  add column if not exists storage_path text;

comment on column public.call_recordings.storage_path is
  'Caminho no bucket call-recordings: {organization_id}/{call_id}/{recording_sid}.mp3. '
  'Preenchido por telephony-archive-recording APÓS confirmar o upload; só então o '
  'áudio é apagado do Twilio.';

-- Bucket PRIVADO. Gravação de ligação com cliente não pode ser pública.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

-- Leitura restrita à organização dona da gravação, no mesmo padrão do bucket
-- `attachments` (que faz o join com `documents` e usa user_has_org_access).
drop policy if exists "call_recordings_select" on storage.objects;
create policy "call_recordings_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-recordings'
    and exists (
      select 1 from public.call_recordings r
       where r.storage_path = storage.objects.name
         and public.user_has_org_access(r.organization_id)
    )
  );

-- Escrita e remoção NÃO são expostas a `authenticated`: quem grava e quem apaga
-- é a edge function com service_role (que não passa por RLS). Deixar authenticated
-- fora significa que ninguém pela interface pode subir ou apagar áudio de ligação.
drop policy if exists "call_recordings_insert" on storage.objects;
drop policy if exists "call_recordings_delete" on storage.objects;

-- Retenção: NÃO precisa de coluna nova. O padrão já existe em
-- intelligence_settings.privacy (jsonb) com `transcription_retention_days`, lido
-- pelo intelligence-retention-cron (cron diário 30 4 * * *). Acrescentamos a
-- chave `call_recording_retention_days` no MESMO jsonb, com o mesmo default de
-- 180 dias, para as organizações que já têm linha.
update public.intelligence_settings
   set privacy = coalesce(privacy, '{}'::jsonb)
                 || jsonb_build_object('call_recording_retention_days', 180),
       updated_at = now()
 where privacy is null
    or not (privacy ? 'call_recording_retention_days');
