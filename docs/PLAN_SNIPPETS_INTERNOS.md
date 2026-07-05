# Plano — Snippets Internos (mensagens pré-prontas Seialz)

Última atualização: 2026-07-05

## Contexto
Depois do hotfix "LOW + janela aberta → bloquear todos os templates" (endpoint 7020),
o usuário fica sem atalho no composer quando a janela está aberta: precisa digitar
tudo à mão. Os snippets internos preenchem essa lacuna sem tocar em templates Meta.

## Escopo

### O que é
- Biblioteca de **respostas rápidas / atalhos textuais** gerenciada dentro do Seialz.
- Textos livres com variáveis simples (`{{nome_contato}}`, `{{primeiro_nome}}`, `{{empresa}}`).
- **Não** passam pela Meta, **não** têm status de aprovação, **não** são templates HSM.
- São enviados como **freeform** pelo endpoint atual da conversa (payload de texto normal).

### Quando aparecem
- Apenas quando a **janela WhatsApp está aberta** (`serviceWindow.isOpen === true`).
- Fora da janela → botão "Snippets" fica oculto/disabled (só templates aprovados podem sair).
- Independem de `endpoint.purpose` e de `allowed_purposes`.

### Onde aparecem
- Composer da tela `/messages` (SeialzChatInput / composer principal).
- Composer da tela `/inbox` (InboxComposer).
- Ambos ganham um botão "Snippets" ao lado do botão "Templates".

## Modelo de dados

Nova tabela `public.message_snippets`:

| coluna              | tipo          | notas                                                     |
|---------------------|---------------|-----------------------------------------------------------|
| id                  | uuid PK       | `gen_random_uuid()`                                       |
| organization_id     | uuid NOT NULL | FK lógica p/ organizations                                |
| title               | text NOT NULL | rótulo exibido na lista (ex.: "Boas-vindas")              |
| body                | text NOT NULL | corpo com `{{variaveis}}`                                 |
| shortcut            | text NULL     | atalho tipo `/oi` (opcional, para autocompletar)          |
| category            | text NULL     | agrupamento (Comercial, Atendimento, Cobrança...)         |
| is_active           | boolean       | default true                                              |
| created_by          | uuid NULL     | FK lógica p/ users                                        |
| created_at          | timestamptz   | default now()                                             |
| updated_at          | timestamptz   | default now()                                             |

Índices:
- `(organization_id, is_active)`
- `(organization_id, shortcut)` parcial `WHERE shortcut IS NOT NULL`

RLS: acesso restrito à organização do usuário (`organization_id = ANY(current_user_org_ids())`).
GRANTs padrão de tabela user-facing (authenticated select/insert/update/delete; service_role all).

## Interpolação de variáveis
Suportar (client-side, no ato do envio):
- `{{nome_contato}}` → contact.full_name
- `{{primeiro_nome}}` → primeira palavra de contact.full_name
- `{{empresa}}` → contact.company_name (se houver)
- `{{agente}}` → auth.user.full_name

Fallback: variável não resolvida vira string vazia (não deixar `{{var}}` no envio).

## UI

### Composer
- Novo `SnippetsPicker`:
  - Botão "Snippets" (ícone Lightning) — visível **apenas** se `windowIsOpen === true`.
  - Popover com search + lista agrupada por categoria.
  - Ao selecionar: interpola variáveis e injeta texto no campo do composer
    (não envia direto — usuário pode revisar/editar).
- Atalho `/` no início do campo abre picker filtrando por `shortcut`.

### Gerenciamento
- Página `/settings/snippets` (dentro de Configurações):
  - CRUD simples: título, atalho, categoria, corpo, ativo/inativo.
  - Preview com variáveis substituídas por placeholders.
  - Admin da org (ou owner) pode criar/editar/excluir.

## Envio
- Reutiliza fluxo existente de mensagem freeform:
  - `dispatchWhatsAppSend` sem `templateId`, `message = corpoInterpolado`.
  - Guardas atuais continuam válidas (rate limit, purpose, LOW+window) —
    mas como não há templateId, o guard de template não se aplica.
  - Registro em `messages.metadata.snippet_id` para auditoria.

## Compliance
- **Nada muda** para templates Meta:
  - primeiro_contato / tentativa_de_contato continuam ocultos/bloqueados.
  - LOW + janela aberta continua bloqueando todos os templates.
  - Rate limit 1 template/24h continua.
- Snippets **não contam** para rate limit de template (são texto livre real).
- Snippets **não passam** por allowed_purposes (não são HSM).

## Entregáveis por PR

**PR-Snippets-1 — Schema + backend leve**
- Migration `message_snippets` + GRANTs + RLS.
- Seed opcional com 3–4 snippets de exemplo por org (só em ambiente dev).

**PR-Snippets-2 — Página de gerenciamento**
- `/settings/snippets` (list/create/edit/delete).
- Hook `useSnippets(orgId)` com realtime.

**PR-Snippets-3 — Picker no composer**
- `SnippetsPicker` component.
- Integração em SeialzChatInput e InboxComposer.
- Interpolação client-side + atalho `/`.
- Botão só renderiza quando `windowIsOpen`.

**PR-Snippets-4 — Auditoria & telemetria (opcional)**
- Coluna `messages.snippet_id` (nullable FK) ou `metadata.snippet_id`.
- Contador de uso por snippet (updated_at + trigger simples).

## Fora do escopo (por ora)
- Compartilhar snippets entre orgs.
- Snippets com mídia anexa.
- Versionamento/histórico de edição.
- Aprovação por outro admin antes de publicar.

## Riscos
- Usuário confundir snippet com template Meta → mitigado por rótulo e ícone distintos.
- Duplicação com "quick replies" nativas do WhatsApp → snippets são internos; não injetar botões.
- Vazamento acidental de variável não resolvida → fallback para string vazia + validação no editor.
