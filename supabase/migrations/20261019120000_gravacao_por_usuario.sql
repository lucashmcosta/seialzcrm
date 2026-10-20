-- Controle de gravação de ligação por PESSOA, não só por número.
--
-- Hoje a decisão vem de organization_phone_numbers.recording_enabled, e a
-- Central Trabalhista tem um único número compartilhado por 20 pessoas --
-- advogado, CS e sócio inclusive. Gravar é tudo ou nada.
--
-- A coluna é NULLABLE de propósito e o default é NULL:
--
--     NULL  -> segue o número (comportamento de hoje, nada muda)
--     true  -> grava esta pessoa mesmo que o número esteja desligado
--     false -> NÃO grava esta pessoa mesmo que o número esteja ligado
--
-- Ou seja, entra como mecanismo de EXCEÇÃO. Ligar a gravação no número passa a
-- valer para todos, e quem não deve ser gravado é desligado individualmente.

alter table public.organization_phone_number_users
  add column if not exists recording_enabled boolean;

comment on column public.organization_phone_number_users.recording_enabled is
  'Gravação desta pessoa neste número. NULL = segue organization_phone_numbers.recording_enabled; '
  'true/false sobrepõem. Resolvido por resolveRecordingEnabled() em _shared/telephony/recording.ts.';
