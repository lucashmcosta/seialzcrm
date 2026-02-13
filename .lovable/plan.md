
# Prevencao de duplicatas no lead-webhook

## Problema

A edge function `lead-webhook` cria contatos e oportunidades sem nenhuma verificacao de duplicatas. Quando um lead externo envia o mesmo contato mais de uma vez (mesmo telefone ou email), o sistema cria registros duplicados. Isso ja gerou duplicatas reais no banco (ex: "Vilma Renatta de Souza" 2x, "Fernanda dos Santos Pezzotti" 2x).

O frontend (`ContactForm`) ja tem logica de duplicatas, mas o webhook ignora completamente.

## Solucao

Adicionar verificacao de duplicatas na edge function `lead-webhook`, respeitando as configuracoes da organizacao (`duplicate_check_mode` e `duplicate_enforce_block`).

## O que muda

**Arquivo**: `supabase/functions/lead-webhook/index.ts`

### Logica de duplicatas no webhook

1. Antes de criar o contato, buscar as configuracoes da organizacao (`duplicate_check_mode`)
2. Com base no modo configurado (`email`, `phone`, `email_or_phone`), verificar se ja existe um contato com o mesmo dado
3. Se encontrar duplicata:
   - Se `duplicate_enforce_block = true`: retornar erro 409 (Conflict) com os dados do contato existente
   - Se `duplicate_enforce_block = false`: reusar o contato existente em vez de criar um novo (e ainda criar oportunidade se solicitado)
4. Se modo = `none`: comportamento atual (sempre cria)

### Fluxo atualizado

```text
Webhook recebe lead
    |
    v
Busca org settings (duplicate_check_mode)
    |
    v
Modo = "none"? --> Cria contato normalmente
    |
    v (modo != none)
Busca contato existente por email/phone
    |
    v
Encontrou duplicata?
    |-- NAO --> Cria contato normalmente
    |-- SIM + enforce_block --> Retorna 409 com contato existente
    |-- SIM + !enforce_block --> Reutiliza contato existente, cria oportunidade se solicitado
```

### Resposta 409 (duplicata bloqueada)

```json
{
  "error": "Duplicate contact found",
  "existing_contact_id": "uuid",
  "existing_contact_name": "Nome",
  "duplicate_field": "phone"
}
```

### Resposta 200 (duplicata reutilizada)

```json
{
  "success": true,
  "contact_id": "uuid-existente",
  "opportunity_id": "uuid-novo-ou-null",
  "activity_id": "uuid-novo-ou-null",
  "message": "Existing contact reused, opportunity created",
  "duplicate_reused": true
}
```

## Limpeza de duplicatas existentes

Apos o deploy, sera necessario limpar os registros duplicados que ja existem no banco. Isso pode ser feito manualmente via SQL no Cloud View, mas nao faz parte desta implementacao automatica (requer decisao humana sobre qual registro manter).

## Detalhes tecnicos

No `lead-webhook/index.ts`, apos validar a API key e antes de criar o contato (linha 131):

1. Buscar `duplicate_check_mode` e `duplicate_enforce_block` da organizacao
2. Montar query de busca por duplicata baseada no modo
3. Se duplicata encontrada, decidir entre bloquear (409) ou reutilizar

A busca de duplicatas usa o telefone normalizado (ja passa por `normalizePhoneToE164`) para garantir que `+5588981061115` e `88981061115` sejam reconhecidos como o mesmo numero.

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/lead-webhook/index.ts` | Adicionar verificacao de duplicatas antes de criar contato |
