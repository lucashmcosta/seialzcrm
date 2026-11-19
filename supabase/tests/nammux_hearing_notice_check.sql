\set ON_ERROR_STOP on

-- Leitura de data e hora nas mensagens (20261119100000_nammux_hearing_notice_check.sql).
-- O que este teste existe para provar: os formatos que a equipe e os modelos
-- usam são reconhecidos, e número que não é data não vira data.

do $casos$
declare c record; got text;
begin
  for c in
    select * from (values
      ('sua audiência já está marcada: 📅 Data: *19/11/2026* ⏰ Horário: *08:30* 💻 Por videoconferência', '2026-11-13', '2026-11-19 08:30'),
      ('📅 Data: *19 de Novembro de 2026* ⏰ Horário: *11:00* 📍 Local: 4ª Vara', '2026-11-13', '2026-11-19 11:00'),
      ('conforme os dados abaixo: 📅 Data: 19/11/2026 (quinta-feira) ⏰ Horário: 10h25 📍 Modalidade: Presencial', '2026-10-05', '2026-11-19 10:25'),
      ('A audiência ficou para o dia 03.02.2027 às 09h05min (horário de MT)', '2026-11-16', '2027-02-03 09:05'),
      ('sua audiência será dia 19/11 às 9h', '2026-11-10', '2026-11-19 09:00'),
      ('sua audiência será dia 12/01 às 14:30', '2026-12-20', '2027-01-12 14:30'),
      ('audiência em 1 de março de 2027, 13h40', '2026-11-10', '2027-03-01 13:40'),
      ('audiências: 19/11/2026 08:30 e 27/11/2026 10:20', '2026-11-10', '2026-11-19 08:30|2026-11-27 10:20'),
      -- não é data com hora
      ('Estamos aguardando a designação da audiência pelo juízo.', '2026-11-10', null),
      ('Processo 0001234-56.2026.5.02.0001 - Valor da causa R$ 47.000,00', '2026-11-10', null),
      ('Chegar com 30 minutos de antecedência, audiência no dia 19/11/2026', '2026-11-10', null),
      ('audiência dia 31/02/2027 às 10:00', '2026-11-10', null),
      ('ligue no (11) 99999-0000 das 07h30 às 14h30', '2026-11-10', null),
      (null, '2026-11-10', null)
    ) as v(texto, ref, esperado)
  loop
    select string_agg(to_char(m.dia, 'YYYY-MM-DD') || ' ' || m.hora, '|' order by m.dia, m.hora) into got
      from public.nammux_hearing_mentions(c.texto, c.ref::date) m;
    if got is distinct from c.esperado then
      raise exception 'FALHA: "%" => % (esperava %)', c.texto, got, c.esperado;
    end if;
  end loop;
  raise notice 'nammux_hearing_mentions: 14 casos OK';
end
$casos$;
