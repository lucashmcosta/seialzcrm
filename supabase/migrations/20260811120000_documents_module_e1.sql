-- ============================================================
-- Módulo de Documentos — ETAPA 1 (fundação)
-- Projeto: qvmtzfvkhkhkhdpclzua
--
-- Estritamente fundação: catálogo canônico global de document_types,
-- organization_document_types, colunas/índices/constraints em documents,
-- is_current + view documents_current, RLS, normalização controlada dos
-- 11 contact_document. NADA de uploader novo, evaluator, regras de WON,
-- UI de slots ou triagem. NÃO cria organizations.document_rules (o lar
-- canônico da policy de fechamento é opportunity_close_policies).
--
-- Reversível: DOWN em supabase/rollback/. Aplicada por MCP (que envolve
-- em transação). Rodada antes como dry-run com ROLLBACK contra prod.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Destravar cardinalidade: o unique de Fase 1 (entity_id, type)
--    bloqueia tipos `multiple`. Substituído por documents_single_current_uk.
-- ------------------------------------------------------------
drop index if exists public.documents_entity_type_uq;

-- ------------------------------------------------------------
-- 2. document_types → catálogo canônico. organization_id null = global.
-- ------------------------------------------------------------
alter table public.document_types
  alter column organization_id drop not null;

alter table public.document_types
  add column if not exists category_code   text,
  add column if not exists owner_type      text    not null default 'contact',
  add column if not exists cardinality     text    not null default 'single',
  add column if not exists reference_kind  text    not null default 'none',
  add column if not exists validity_mode   text    not null default 'none',
  add column if not exists validity_days   integer,
  add column if not exists has_two_sides   boolean not null default false,
  add column if not exists is_syncable     boolean not null default true;

alter table public.document_types
  add constraint document_types_category_chk check (category_code in (
    'IDENTIFICACAO','ENDERECO','REPRESENTACAO','TRIAGEM','CONTRATACAO',
    'FINANCEIRO','PARCERIA','VINCULO','REMUNERACAO','JORNADA','RESCISAO',
    'SAUDE','PREVIDENCIARIO_FISCAL','PARTE_CONTRARIA','VIAGEM',
    'OCORRENCIA_VOO','DANOS_DESPESAS','ATENDIMENTO','PROVA','OUTROS')),
  add constraint document_types_owner_type_chk
    check (owner_type in ('contact','opportunity')),
  add constraint document_types_cardinality_chk
    check (cardinality in ('single','multiple')),
  add constraint document_types_reference_kind_chk
    check (reference_kind in ('none','date','month','period')),
  add constraint document_types_validity_mode_chk
    check (validity_mode in ('none','derived','stated'));

alter table public.document_types
  add constraint document_types_validity_days_chk
    check ((validity_mode = 'derived' and validity_days is not null)
        or (validity_mode <> 'derived' and validity_days is null));

alter table public.document_types
  add constraint document_types_validity_stated_chk
    check (not (validity_mode = 'stated' and reference_kind = 'none'));

alter table public.document_types
  add constraint document_types_reference_cardinality_chk
    check (not (reference_kind = 'month' and cardinality = 'single'));

alter table public.document_types
  add constraint document_types_two_sides_chk
    check (not (has_two_sides and cardinality = 'multiple'));

create unique index if not exists document_types_code_global_uk
  on public.document_types (code)
  where organization_id is null and deleted_at is null;

create unique index if not exists document_types_code_org_uk
  on public.document_types (organization_id, code)
  where organization_id is not null and deleted_at is null;

-- RLS select: precisa aceitar o catálogo global (organization_id null),
-- senão o dropdown fica vazio. Preserva role `authenticated` (anônimo não
-- enxerga). insert/update/delete ficam como estão (barram o canônico).
drop policy if exists "document_types select org members" on public.document_types;
create policy "document_types select org members"
  on public.document_types for select to authenticated
  using (organization_id is null or organization_id = any (current_user_org_ids()));

-- ------------------------------------------------------------
-- 3. organization_document_types — habilitação N:N por tenant.
--    RLS on sem policy = deny-all a usuário comum (migrations/service_role
--    bypassam). Policies de leitura entram na Etapa 2 quando o FE ler.
-- ------------------------------------------------------------
create table if not exists public.organization_document_types (
  organization_id  uuid    not null references public.organizations(id) on delete cascade,
  document_type_id uuid    not null references public.document_types(id),
  is_enabled       boolean not null default true,
  sort_order       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, document_type_id)
);

alter table public.organization_document_types enable row level security;

-- ------------------------------------------------------------
-- 4. documents → colunas do módulo. storage_path já existe (no-op).
-- ------------------------------------------------------------
alter table public.documents
  add column if not exists content_hash        text,
  add column if not exists storage_path        text,
  add column if not exists reference_date      date,
  add column if not exists reference_end_date  date,
  add column if not exists reference_month     date,
  add column if not exists expires_at          date,
  add column if not exists original_file_name  text,
  add column if not exists display_name        text,
  add column if not exists both_sides_in_file  boolean not null default false,
  add column if not exists is_incomplete       boolean not null default false,
  add column if not exists version             integer not null default 1,
  add column if not exists root_document_id    uuid references public.documents(id),
  add column if not exists superseded_by_id    uuid references public.documents(id),
  add column if not exists superseded_at       timestamptz,
  add column if not exists external_source     text,
  add column if not exists external_ref        text,
  add column if not exists is_single           boolean not null default false;

-- Corrente = não substituído e não excluído. Definição do banco, não convenção.
alter table public.documents
  add column if not exists is_current boolean
  generated always as (superseded_by_id is null and deleted_at is null) stored;

create unique index if not exists documents_superseded_by_uk
  on public.documents (superseded_by_id)
  where superseded_by_id is not null;

create unique index if not exists documents_single_current_uk
  on public.documents (organization_id, entity_type, entity_id, document_type_id)
  where is_current and is_single;

create unique index if not exists documents_hash_uk
  on public.documents (organization_id, entity_type, entity_id, document_type_id, content_hash)
  where is_current and content_hash is not null;

create index if not exists documents_pendencia_idx
  on public.documents (organization_id, entity_type, entity_id, document_type_id)
  where is_current and not is_incomplete;

create index if not exists documents_expires_idx
  on public.documents (organization_id, expires_at)
  where is_current and expires_at is not null;

create index if not exists documents_historico_idx
  on public.documents (root_document_id, version);

create unique index if not exists documents_external_uk
  on public.documents (organization_id, external_source, external_ref)
  where external_source is not null and external_ref is not null;

-- View canônica. security_invoker OBRIGATÓRIO (senão vaza entre orgs).
create or replace view public.documents_current
  with (security_invoker = true) as
  select * from public.documents where is_current;

-- ------------------------------------------------------------
-- 5. Backfills de fundação (legado nunca fica nulo).
-- ------------------------------------------------------------
update public.documents
   set original_file_name = file_name
 where original_file_name is null;

update public.documents
   set root_document_id = id
 where root_document_id is null;

-- ------------------------------------------------------------
-- 6. Snapshot reversível ANTES das mutações (remap + normalização).
--    Captura entity_type + document_type_id de tudo que será tocado.
-- ------------------------------------------------------------
create table if not exists public._documents_e1_backup as
  select id, entity_type, document_type_id
  from public.documents
  where entity_type = 'contact_document' or document_type_id is not null;

-- ------------------------------------------------------------
-- 7. Catálogo canônico global (140 tipos).
--    Colunas: code|name|category_code|owner_type|cardinality|
--    reference_kind|validity_mode|validity_days|has_two_sides|
--    is_syncable|is_required|is_active|sort_order
-- ------------------------------------------------------------
insert into public.document_types
  (organization_id, code, name, category_code, owner_type, cardinality,
   reference_kind, validity_mode, validity_days, has_two_sides,
   is_syncable, is_required, is_active, sort_order)
values
-- ---------- IDENTIFICACAO ----------
(null,'RG','RG / Carteira de Identidade','IDENTIFICACAO','contact','single','none','none',null,true,true,false,true,10),
(null,'CPF','CPF','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,20),
(null,'CNH','CNH','IDENTIFICACAO','contact','single','date','stated',null,true,true,false,true,30),
(null,'CTPS','CTPS','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,40),
(null,'PIS_PASEP_NIT','PIS / PASEP / NIT','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,50),
(null,'CERTIDAO_NASCIMENTO','Certidão de nascimento','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,60),
(null,'CERTIDAO_CASAMENTO','Certidão de casamento','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,70),
(null,'CERTIDAO_OBITO','Certidão de óbito','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,80),
(null,'PASSAPORTE','Passaporte','IDENTIFICACAO','contact','single','date','stated',null,false,true,false,true,90),
(null,'RNE','RNE — Registro Nacional do Estrangeiro','IDENTIFICACAO','contact','single','date','stated',null,true,true,false,true,100),
(null,'TITULO_ELEITOR','Título de eleitor','IDENTIFICACAO','contact','single','none','none',null,true,true,false,true,110),
(null,'FOTO_COM_DOCUMENTO','Foto do titular com documento','IDENTIFICACAO','contact','single','none','none',null,false,true,false,true,120),
-- ---------- ENDERECO ----------
(null,'COMPROVANTE_RESIDENCIA','Comprovante de residência','ENDERECO','contact','multiple','date','derived',90,false,true,false,true,10),
(null,'DECLARACAO_RESIDENCIA','Declaração de residência','ENDERECO','contact','multiple','date','derived',90,false,true,false,true,20),
-- ---------- REPRESENTACAO ----------
(null,'PROCURACAO_AD_JUDICIA','Procuração ad judicia','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,10),
(null,'CONTRATO_HONORARIOS','Contrato de honorários','REPRESENTACAO','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'SUBSTABELECIMENTO','Substabelecimento','REPRESENTACAO','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'DECLARACAO_HIPOSSUFICIENCIA','Declaração de hipossuficiência','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,40),
(null,'TERMO_CONSENTIMENTO_LGPD','Termo de consentimento LGPD','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,50),
(null,'DOCUMENTO_REPRESENTANTE_LEGAL','Documento do representante legal','REPRESENTACAO','contact','multiple','none','none',null,false,true,false,true,60),
(null,'TERMO_TUTELA_CURATELA','Termo de tutela / curatela','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,70),
(null,'ALVARA_JUDICIAL_REPRESENTACAO','Alvará judicial de representação','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,80),
(null,'CONTRATO_SOCIAL_CLIENTE','Contrato social — cliente PJ','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,90),
(null,'ATA_ELEICAO_DIRETORIA','Ata de eleição de diretoria','REPRESENTACAO','contact','multiple','date','none',null,false,true,false,true,100),
-- ---------- TRIAGEM ----------
(null,'FICHA_ATENDIMENTO','Ficha de atendimento','TRIAGEM','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'FORMULARIO_QUALIFICACAO','Formulário de qualificação preenchido','TRIAGEM','opportunity','multiple','date','none',null,false,false,false,true,20),
(null,'CHECKLIST_DOCUMENTOS','Checklist de documentos assinado','TRIAGEM','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'REGISTRO_LEAD_ORIGEM','Registro do lead na origem','TRIAGEM','opportunity','multiple','date','none',null,false,false,false,true,40),
(null,'GRAVACAO_LIGACAO','Gravação de ligação','TRIAGEM','opportunity','multiple','date','none',null,false,false,false,true,50),
(null,'TRANSCRICAO_LIGACAO','Transcrição de ligação','TRIAGEM','opportunity','multiple','date','none',null,false,false,false,true,60),
-- ---------- CONTRATACAO ----------
(null,'PROPOSTA_COMERCIAL','Proposta comercial','CONTRATACAO','opportunity','multiple','date','none',null,false,false,false,true,10),
(null,'ADITIVO_CONTRATO_HONORARIOS','Aditivo ao contrato de honorários','CONTRATACAO','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'TERMO_CIENCIA_RISCO','Termo de ciência de risco','CONTRATACAO','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'AUTORIZACAO_USO_IMAGEM','Autorização de uso de imagem','CONTRATACAO','contact','multiple','date','none',null,false,false,false,true,40),
(null,'DISTRATO','Distrato / rescisão contratual','CONTRATACAO','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'TERMO_DESISTENCIA','Termo de desistência do cliente','CONTRATACAO','opportunity','multiple','date','none',null,false,true,false,true,60),
-- ---------- FINANCEIRO (nada sai do CRM) ----------
(null,'COMPROVANTE_PAGAMENTO_CLIENTE','Comprovante de pagamento do cliente','FINANCEIRO','opportunity','multiple','date','none',null,false,false,false,true,10),
(null,'NOTA_FISCAL_SERVICO','Nota fiscal de serviço emitida','FINANCEIRO','opportunity','multiple','month','none',null,false,false,false,true,20),
(null,'BOLETO_COBRANCA','Boleto / cobrança','FINANCEIRO','opportunity','multiple','date','none',null,false,false,false,true,30),
(null,'DADOS_BANCARIOS_CLIENTE','Dados bancários para repasse','FINANCEIRO','contact','single','none','none',null,false,false,false,true,40),
-- ---------- PARCERIA ----------
(null,'TERMO_PARCERIA_INDICACAO','Termo de parceria / indicação','PARCERIA','contact','multiple','date','none',null,false,false,false,true,10),
(null,'DOCUMENTO_PARCEIRO','Documento do parceiro captador','PARCERIA','contact','multiple','none','none',null,false,false,false,true,20),
-- ---------- VINCULO ----------
(null,'CONTRATO_TRABALHO','Contrato de trabalho','VINCULO','opportunity','multiple','period','none',null,false,true,false,true,10),
(null,'CTPS_ANOTACOES','Páginas de anotação da CTPS','VINCULO','opportunity','multiple','period','none',null,false,true,false,true,20),
(null,'FICHA_REGISTRO_EMPREGADO','Ficha de registro de empregado','VINCULO','opportunity','single','none','none',null,false,true,false,true,30),
(null,'TERMO_ADITIVO_CONTRATUAL','Termo aditivo contratual','VINCULO','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'CRACHA_FUNCIONAL','Crachá / carteira funcional','VINCULO','opportunity','single','none','none',null,false,true,false,true,50),
(null,'COMUNICACAO_ADMISSAO','Comunicação de admissão','VINCULO','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'TERMO_COMPROMISSO_ESTAGIO','Termo de compromisso de estágio','VINCULO','opportunity','multiple','period','none',null,false,true,false,true,70),
(null,'CONTRATO_PRESTACAO_SERVICO','Contrato de prestação de serviço','VINCULO','opportunity','multiple','period','none',null,false,true,false,true,80),
(null,'NOTA_FISCAL_PRESTADOR','Nota fiscal emitida pelo prestador','VINCULO','opportunity','multiple','month','none',null,false,true,false,true,90),
-- ---------- REMUNERACAO ----------
(null,'HOLERITE','Holerite / contracheque','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,10),
(null,'EXTRATO_FGTS','Extrato analítico do FGTS','REMUNERACAO','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'GUIA_RECOLHIMENTO_FGTS','Guia de recolhimento do FGTS','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,30),
(null,'EXTRATO_BANCARIO','Extrato bancário','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,40),
(null,'COMPROVANTE_DEPOSITO_SALARIO','Comprovante de depósito de salário','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,50),
(null,'RECIBO_PAGAMENTO_AVULSO','Recibo de pagamento avulso','REMUNERACAO','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'COMPROVANTE_COMISSAO','Comprovante de comissão / premiação','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,70),
(null,'RECIBO_FERIAS','Recibo de férias','REMUNERACAO','opportunity','multiple','period','none',null,false,true,false,true,80),
(null,'RECIBO_DECIMO_TERCEIRO','Recibo de 13º salário','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,90),
(null,'RECIBO_VALE_BENEFICIO','Recibo de vale-transporte / alimentação','REMUNERACAO','opportunity','multiple','month','none',null,false,true,false,true,100),
-- ---------- JORNADA ----------
(null,'CARTAO_PONTO','Cartão / folha de ponto','JORNADA','opportunity','multiple','month','none',null,false,true,false,true,10),
(null,'ESPELHO_PONTO','Espelho de ponto eletrônico','JORNADA','opportunity','multiple','month','none',null,false,true,false,true,20),
(null,'ESCALA_TRABALHO','Escala de trabalho','JORNADA','opportunity','multiple','period','none',null,false,true,false,true,30),
(null,'CONTROLE_BANCO_HORAS','Controle de banco de horas','JORNADA','opportunity','multiple','period','none',null,false,true,false,true,40),
(null,'REGISTRO_HORA_EXTRA','Registro / autorização de hora extra','JORNADA','opportunity','multiple','month','none',null,false,true,false,true,50),
-- ---------- RESCISAO ----------
(null,'TRCT','TRCT — Termo de rescisão','RESCISAO','opportunity','single','date','none',null,false,true,false,true,10),
(null,'AVISO_PREVIO','Aviso prévio','RESCISAO','opportunity','single','date','none',null,false,true,false,true,20),
(null,'PEDIDO_DEMISSAO','Pedido de demissão / carta de dispensa','RESCISAO','opportunity','single','date','none',null,false,true,false,true,30),
(null,'TERMO_HOMOLOGACAO_RESCISAO','Termo de homologação sindical','RESCISAO','opportunity','single','date','none',null,false,true,false,true,40),
(null,'COMUNICACAO_DISPENSA_SEGURO_DESEMPREGO','Comunicação de dispensa / seguro-desemprego','RESCISAO','opportunity','single','date','none',null,false,true,false,true,50),
(null,'EXTRATO_SAQUE_FGTS','Extrato de saque do FGTS','RESCISAO','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'TERMO_QUITACAO_ANUAL','Termo de quitação anual','RESCISAO','opportunity','multiple','date','none',null,false,true,false,true,70),
(null,'TERMO_ADESAO_PDV','Termo de adesão a PDV / PDI','RESCISAO','opportunity','single','date','none',null,false,true,false,true,80),
-- ---------- SAUDE ----------
(null,'ATESTADO_MEDICO','Atestado médico','SAUDE','contact','multiple','date','none',null,false,true,false,true,10),
(null,'EXAME_PRONTUARIO_MEDICO','Exame / prontuário médico','SAUDE','contact','multiple','date','none',null,false,true,false,true,20),
(null,'COMUNICACAO_ACIDENTE_TRABALHO','CAT — Comunicação de acidente de trabalho','SAUDE','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'ATESTADO_SAUDE_OCUPACIONAL','ASO — Atestado de saúde ocupacional','SAUDE','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'PERFIL_PROFISSIOGRAFICO','PPP — Perfil profissiográfico','SAUDE','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'LTCAT','LTCAT','SAUDE','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'PGR_PCMSO','PGR / PCMSO','SAUDE','opportunity','multiple','period','none',null,false,true,false,true,70),
(null,'FICHA_ENTREGA_EPI','Ficha de entrega de EPI','SAUDE','opportunity','multiple','period','none',null,false,true,false,true,80),
-- ---------- PREVIDENCIARIO_FISCAL ----------
(null,'CNIS','CNIS','PREVIDENCIARIO_FISCAL','contact','multiple','date','derived',90,false,true,false,true,10),
(null,'EXTRATO_BENEFICIO_INSS','Extrato de benefício INSS','PREVIDENCIARIO_FISCAL','contact','multiple','date','derived',90,false,true,false,true,20),
(null,'INFORME_RENDIMENTOS','Informe de rendimentos','PREVIDENCIARIO_FISCAL','contact','multiple','date','none',null,false,true,false,true,30),
(null,'DECLARACAO_IMPOSTO_RENDA','Declaração de Imposto de Renda','PREVIDENCIARIO_FISCAL','contact','multiple','date','none',null,false,true,false,true,40),
-- ---------- PARTE_CONTRARIA ----------
(null,'CONTRATO_SOCIAL_PARTE_CONTRARIA','Contrato social — parte contrária','PARTE_CONTRARIA','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'CARTAO_CNPJ','Cartão CNPJ','PARTE_CONTRARIA','opportunity','multiple','date','derived',90,false,true,false,true,20),
(null,'CERTIDAO_JUNTA_COMERCIAL','Certidão simplificada da Junta Comercial','PARTE_CONTRARIA','opportunity','multiple','date','derived',30,false,true,false,true,30),
(null,'CERTIDAO_DISTRIBUICAO','Certidão de distribuição','PARTE_CONTRARIA','opportunity','multiple','date','derived',90,false,true,false,true,40),
(null,'NORMA_COLETIVA','CCT / ACT — norma coletiva','PARTE_CONTRARIA','opportunity','multiple','period','none',null,false,true,false,true,50),
(null,'REGULAMENTO_INTERNO','Regulamento interno da empresa','PARTE_CONTRARIA','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'DOCUMENTO_RECUPERACAO_FALENCIA','Documento de recuperação judicial / falência','PARTE_CONTRARIA','opportunity','multiple','date','none',null,false,true,false,true,70),
-- ---------- VIAGEM ----------
(null,'BILHETE_AEREO','Bilhete aéreo / e-ticket','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'CARTAO_EMBARQUE','Cartão de embarque','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'LOCALIZADOR_RESERVA','Localizador da reserva (PNR)','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'ITINERARIO_RESERVA','Itinerário da reserva','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'COMPROVANTE_COMPRA_PASSAGEM','Comprovante de compra da passagem','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'COMPROVANTE_CHECKIN','Comprovante de check-in','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'COMPROVANTE_PAGAMENTO_BAGAGEM','Comprovante de pagamento de bagagem','VIAGEM','opportunity','multiple','date','none',null,false,true,false,true,70),
(null,'APOLICE_SEGURO_VIAGEM','Apólice de seguro viagem','VIAGEM','opportunity','multiple','period','stated',null,false,true,false,true,80),
(null,'EXTRATO_PROGRAMA_FIDELIDADE','Extrato de programa de fidelidade','VIAGEM','contact','multiple','date','none',null,false,true,false,true,90),
(null,'AUTORIZACAO_VIAGEM_MENOR','Autorização de viagem de menor','VIAGEM','contact','multiple','date','none',null,false,true,false,true,100),
-- ---------- OCORRENCIA_VOO ----------
(null,'DECLARACAO_ATRASO_CANCELAMENTO','Declaração de atraso / cancelamento','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'REGISTRO_IRREGULARIDADE_BAGAGEM','RIB — Registro de irregularidade de bagagem','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'REGISTRO_STATUS_VOO','Registro público de status do voo','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'NOTIFICACAO_COMPANHIA','Notificação da companhia','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'COMPROVANTE_REACOMODACAO','Comprovante de reacomodação / novo bilhete','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'TERMO_PRETERICAO_EMBARQUE','Termo de preterição de embarque','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'TERMO_RECUSA_EMBARQUE','Termo de recusa de embarque','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,70),
(null,'TERMO_ASSISTENCIA_MATERIAL','Termo de assistência material recebida','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,80),
(null,'BOLETIM_OCORRENCIA','Boletim de ocorrência','OCORRENCIA_VOO','opportunity','multiple','date','none',null,false,true,false,true,90),
-- ---------- DANOS_DESPESAS ----------
(null,'RECIBO_HOSPEDAGEM','Recibo de hospedagem','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'RECIBO_ALIMENTACAO','Recibo de alimentação','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'RECIBO_TRANSPORTE_LOCAL','Recibo de transporte / táxi','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'COMPROVANTE_RECOMPRA_ITENS','Comprovante de recompra de itens da bagagem','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'RELACAO_BENS_BAGAGEM','Relação de bens da bagagem extraviada','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'COMPROVANTE_DESPESA_MEDICA','Comprovante de despesa médica','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'COMPROVANTE_RESERVA_NAO_USUFRUIDA','Comprovante de reserva / diária não usufruída','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,70),
(null,'COMPROVANTE_COMPROMISSO_PERDIDO','Comprovante de compromisso perdido','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,80),
(null,'COMPROVANTE_PREJUIZO_PROFISSIONAL','Comprovante de prejuízo profissional','DANOS_DESPESAS','opportunity','multiple','date','none',null,false,true,false,true,90),
-- ---------- ATENDIMENTO ----------
(null,'PROTOCOLO_ATENDIMENTO_COMPANHIA','Protocolo de atendimento da companhia','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,10),
(null,'RECLAMACAO_CONSUMIDOR_GOV','Reclamação no consumidor.gov.br','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'RECLAMACAO_ANAC','Reclamação na ANAC','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'RECLAMACAO_PROCON','Reclamação no Procon','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'CORRESPONDENCIA_PARTE_CONTRARIA','Correspondência com a parte contrária','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'PROPOSTA_ACORDO_EXTRAJUDICIAL','Proposta de acordo extrajudicial','ATENDIMENTO','opportunity','multiple','date','none',null,false,true,false,true,60),
-- ---------- PROVA ----------
(null,'PRINT_CONVERSA','Print de conversa (WhatsApp / chat)','PROVA','opportunity','multiple','period','none',null,false,true,false,true,10),
(null,'EMAIL','E-mail','PROVA','opportunity','multiple','date','none',null,false,true,false,true,20),
(null,'FOTOGRAFIA','Fotografia','PROVA','opportunity','multiple','date','none',null,false,true,false,true,30),
(null,'ARQUIVO_AUDIO_VIDEO','Áudio / vídeo','PROVA','opportunity','multiple','date','none',null,false,true,false,true,40),
(null,'DECLARACAO_TESTEMUNHA','Declaração de testemunha','PROVA','opportunity','multiple','date','none',null,false,true,false,true,50),
(null,'ROL_TESTEMUNHAS','Rol de testemunhas','PROVA','opportunity','multiple','date','none',null,false,true,false,true,60),
(null,'ATA_NOTARIAL','Ata notarial','PROVA','opportunity','multiple','date','none',null,false,true,false,true,70),
-- ---------- OUTROS ----------
(null,'DOCUMENTO_DIVERSO','Documento diverso','OUTROS','contact','multiple','none','none',null,false,true,false,true,10)
on conflict do nothing;

-- ------------------------------------------------------------
-- 8. Legado: remapear os tipados p/ o catálogo global, desativar tipos
--    antigos, sincronizar is_single. ('Folha Pgto'→HOLERITE, 'rescisao'→TRCT.)
-- ------------------------------------------------------------
with mapa(codigo_legado, codigo_novo) as (
  values ('rg','RG'),
         ('comprovante','COMPROVANTE_RESIDENCIA'),
         ('Folha Pgto','HOLERITE'),
         ('rescisao','TRCT')
)
update public.documents d
   set document_type_id = novo.id
  from public.document_types antigo
  join mapa on mapa.codigo_legado = antigo.code
  join public.document_types novo
    on novo.code = mapa.codigo_novo
   and novo.organization_id is null
 where d.document_type_id = antigo.id
   and antigo.organization_id is not null;

update public.document_types
   set is_active = false, deleted_at = now()
 where organization_id is not null
   and code in ('rg','comprovante','Folha Pgto','rescisao');

update public.documents d
   set is_single = (dt.cardinality = 'single')
  from public.document_types dt
 where dt.id = d.document_type_id;

-- ------------------------------------------------------------
-- 9. Normalização controlada dos 11 contact_document → contact.
--    Snapshot já feito no passo 6. Valida contatos existentes; normaliza
--    só esses; garante 0 remanescentes. (Sem constraint de entity_type
--    nesta etapa — o writer é removido no FE após os gates.)
-- ------------------------------------------------------------
do $$
declare v_orfaos int;
begin
  select count(*) into v_orfaos
  from public.documents d
  where d.entity_type = 'contact_document'
    and not exists (select 1 from public.contacts c where c.id = d.entity_id);
  if v_orfaos > 0 then
    raise exception 'E1: % contact_document apontam para contato inexistente — abortar', v_orfaos;
  end if;
end $$;

update public.documents
   set entity_type = 'contact'
 where entity_type = 'contact_document';

-- ------------------------------------------------------------
-- 10. Asserts defensivos (abortam o apply real se a fundação não bateu).
-- ------------------------------------------------------------
do $$
declare v_ct int; v_glob int;
begin
  select count(*) into v_ct from public.documents where entity_type = 'contact_document';
  if v_ct <> 0 then raise exception 'E1: restam % contact_document', v_ct; end if;
  -- O seed lista 135 tipos (o "140" no comentário original era miscount).
  select count(*) into v_glob from public.document_types where organization_id is null and deleted_at is null;
  if v_glob <> 135 then raise exception 'E1: esperado 135 tipos globais, veio %', v_glob; end if;
end $$;

select pg_notify('pgrst', 'reload schema');
