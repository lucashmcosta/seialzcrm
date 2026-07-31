# Backfill de CPF — Central Trabalhista e Viagi

Atualizado em: 30/07/2026

## Central Trabalhista

Organização:

`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`

Resultado final do backfill:

- Status: `completed`
- Contatos com CPF: `936`
- Processados: `936`
- CPFs verificados: `629`
- CPFs inválidos ou não encontrados: `307`
- Conflitos de nome enviados para revisão: `13`
- Nomes substituídos automaticamente com alta confiança: pelo menos `44`
- Erro final de fornecedor, token ou cota: nenhum

Os registros inválidos ou não encontrados não tiveram seus nomes
sobrescritos.

Os conflitos de nome também não foram sobrescritos. Eles foram armazenados
para revisão.

### Revisão aplicada em 30/07/2026

Após a revisão manual autorizada:

- `13` conflitos de nome foram aceitos;
- o nome retornado pelo provedor foi aplicado aos contatos;
- `38` CPFs inválidos ou não encontrados que ainda estavam preenchidos foram
  preservados no histórico e removidos do campo operacional;
- conflitos de nome pendentes: `0`;
- nomes aprovados ainda divergentes do provedor: `0`;
- CPFs com estado inválido ainda preenchidos: `0`.

## Como localizar os conflitos

Ainda não existe uma tela de conflitos dentro do CRM.

No Supabase do Seialz, abra o **Table Editor** e selecione a tabela:

`registry_data_conflicts`

Utilize os filtros:

| Campo | Valor |
|---|---|
| `organization_id` | `40ae935c-a7f7-4ad7-8ea4-91be6404a95f` |
| `conflict_type` | `cpf_name_mismatch` |
| `status` | `pending` |

Campos relevantes:

| Campo | Significado |
|---|---|
| `contact_id` | Contato relacionado no CRM |
| `current_value` | Nome que estava salvo no Seialz |
| `provider_value` | Nome retornado pelo provedor do CPF |
| `status` | Estado da revisão |

Para abrir o contato correspondente:

```text
https://crm.seialz.com/contacts/{contact_id}
```

Substitua `{contact_id}` pelo valor da linha do conflito.

Na tela do contato podem ser conferidos:

- CPF mascarado;
- nome atual;
- data de nascimento;
- sexo;
- nome da mãe;
- estado técnico da verificação.

Não existe PDF ou documento anexado ao conflito. A evidência disponível é o
retorno cadastral do CPF associado ao perfil protegido do contato.

### Regra usada no backfill

O nome do provedor somente foi aplicado automaticamente quando:

- o primeiro nome coincidia;
- existiam pelo menos dois componentes significativos no nome;
- a similaridade textual era alta ou os sobrenomes relevantes coincidiam.

Casos com troca material de primeiro nome, sobrenomes incompatíveis ou nome
insuficiente foram enviados para revisão.

## Auditoria

As alterações de nome passam pelos gatilhos de auditoria dos contatos. O valor
anterior e o novo valor ficam preservados em `audit_logs`.

As consultas cadastrais ficam registradas em `registry_lookup_audit` sem
armazenar o CPF completo nos logs operacionais.

## Como localizar CPFs inválidos

O estado técnico da verificação fica em:

`contact_identity_profiles`

No **Table Editor**, filtre:

| Campo | Valor |
|---|---|
| `organization_id` | ID da organização desejada |
| `cpf_verification_status` | `invalid` |

Campos relevantes:

| Campo | Significado |
|---|---|
| `contact_id` | Contato relacionado no CRM |
| `verification_provider` | Origem da validação |
| `verification_provider_version` | Versão utilizada |
| `last_error_code` | Motivo técnico registrado |
| `updated_at` | Data da última tentativa |

Interpretação do fornecedor:

- `local-validator`: o CPF falhou na validação matemática local e não foi
  enviado ao fornecedor;
- `cpf-brasil`: o CPF tinha formato matematicamente válido, mas não foi
  encontrado ou foi recusado pelo provedor;
- outro fornecedor: falha registrada pelo adaptador correspondente.

Para abrir o cadastro:

```text
https://crm.seialz.com/contacts/{contact_id}
```

O CPF permanece mascarado na interface. Os logs operacionais guardam somente
hash, últimos dígitos e metadados da tentativa.

Consulta pronta para o **SQL Editor** (troque o ID quando necessário):

```sql
select
  c.id as contact_id,
  c.full_name,
  p.cpf_verification_status,
  p.verification_provider,
  p.last_error_code,
  p.updated_at,
  'https://crm.seialz.com/contacts/' || c.id::text as contact_url
from public.contact_identity_profiles p
join public.contacts c
  on c.id = p.contact_id
 and c.organization_id = p.organization_id
where p.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  and p.cpf_verification_status = 'invalid'
  and c.deleted_at is null
order by p.updated_at desc;
```

Para a Viagi, substitua o ID por:

`b246ef6f-6242-4011-a112-6d8783d2896a`

Depois da remoção autorizada, o perfil volta para `unverified`, pois o contato
deixa de possuir CPF. Para consultar o histórico dos valores removidos, use:

| Campo | Valor |
|---|---|
| `conflict_type` | `cpf_invalid_removed` |
| `status` | `accepted` |

O campo `current_value` guarda o valor anterior e `provider_value` guarda o
fornecedor, versão e erro técnico que motivaram a remoção. O acesso continua
restrito pela RLS da organização.

### CPF incompleto legado

CPF informado no Seialz passa a exigir exatamente 11 dígitos e dígitos
verificadores válidos. O campo continua opcional; a regra é aplicada quando
algum CPF é informado.

Valores legados com quantidade diferente de 11 dígitos devem ser preservados
numa pendência `cpf_incomplete_legacy` antes de o campo do contato ser deixado
em branco. CPFs com 11 dígitos, mas checksum inválido, não devem ser apagados
automaticamente: permanecem na lista de inválidos para revisão.

## Fluxo técnico e observabilidade

CEP, CNPJ e CPF não passam pela inbox/outbox de integrações. São consultas
síncronas à Edge Function `registry-lookup`, pois o formulário precisa exibir
a prévia ou o resultado imediatamente.

O processamento em lote de CPF usa a fila própria
`registry_backfill_jobs`. A observabilidade cadastral é separada da
observabilidade de integrações e utiliza:

| Tabela | Finalidade |
|---|---|
| `registry_lookup_audit` | fornecedor, tipo, duração, resultado e erro por organização |
| `registry_backfill_jobs` | progresso, checkpoint, verificados, conflitos e erros |
| `registry_data_conflicts` | casos que exigem revisão humana |
| `contact_identity_profiles` | estado técnico e dados protegidos da verificação |
| `audit_logs` | alterações feitas nos cadastros |

Todas as tabelas operacionais possuem `organization_id` e políticas RLS. CPF
completo e resposta bruta do fornecedor não são gravados nos logs
operacionais.

## Viagi

Organização:

`b246ef6f-6242-4011-a112-6d8783d2896a`

Resultado final do backfill:

- Status: `completed`
- Contatos com CPF: `423`
- Processados: `423`
- CPFs verificados: `331`
- CPFs inválidos ou não encontrados: `92`
- Nomes que já coincidiam: `281`
- Nomes substituídos automaticamente com alta confiança: `33`
- Casos enviados para revisão: `17`
- Nomes vazios preenchidos: `0`
- Erro final de fornecedor, token ou cota: nenhum

O contador técnico `error_items` terminou em `94`: os `92` CPFs inválidos ou
não encontrados e duas atualizações automáticas de nome que falharam com
segurança. Esses dois casos também foram enviados para revisão; nenhum nome
foi perdido ou substituído parcialmente.

Para localizar os conflitos da Viagi, use os mesmos filtros descritos acima,
alterando apenas:

| Campo | Valor |
|---|---|
| `organization_id` | `b246ef6f-6242-4011-a112-6d8783d2896a` |
| `conflict_type` | `cpf_name_mismatch` |
| `status` | `pending` |

A credencial operacional temporária foi removida após a confirmação do
checkpoint final.

### Revisão aplicada em 30/07/2026

Após a revisão manual autorizada:

- `17` conflitos de nome foram aceitos;
- o nome retornado pelo provedor foi aplicado aos contatos;
- `28` CPFs inválidos ou não encontrados que ainda estavam preenchidos foram
  preservados no histórico e removidos do campo operacional;
- conflitos de nome pendentes: `0`;
- nomes aprovados ainda divergentes do provedor: `0`;
- CPFs com estado inválido ainda preenchidos: `0`.

Dois desses contatos possuíam o mesmo CPF legado. A validação foi corrigida
para não bloquear alterações de nome quando o CPF não muda materialmente.
Novas duplicidades e trocas reais para um CPF já utilizado continuam
bloqueadas.

## Próxima melhoria recomendada

Criar no Seialz uma tela de revisão de conflitos com:

- comparação lado a lado dos nomes;
- link para o contato;
- dados cadastrais relacionados;
- ações **Aceitar nome do provedor** e **Manter nome atual**;
- motivo e usuário responsável pela decisão;
- atualização auditada do status do conflito.
