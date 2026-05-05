## Problema

O upload de arquivos na aba **Anexos** falha (toast vermelho "Erro") porque a política RLS do bucket `attachments` exige que **a primeira pasta do caminho do arquivo seja o ID da organização**:

```sql
-- Política INSERT em storage.objects
((storage.foldername(name))[1])::uuid = ANY (current_user_org_ids())
```

Hoje, o componente `ContactAttachments.tsx` faz upload com o caminho:
```
{entityId}/{timestamp}.{ext}   ← entityId é o id da oportunidade/contato
```

Como o primeiro segmento não é um `organization_id` válido, a RLS bloqueia o upload e o usuário vê "Erro".

## Causa raiz

`src/components/contacts/ContactAttachments.tsx` (linha do upload) usa `entityId` em vez de `organization.id` como pasta raiz no storage.

## Correção

Atualizar o caminho de upload no `ContactAttachments.tsx` para incluir o `organization.id` como primeira pasta, mantendo o `entityId` como subpasta para organização lógica:

```ts
// Antes
const fileName = `${finalEntityId}/${Date.now()}.${fileExt}`;

// Depois
const fileName = `${organization.id}/${finalEntityType}/${finalEntityId}/${Date.now()}.${fileExt}`;
```

Isso:
- Satisfaz a política RLS (primeira pasta = `organization_id`)
- Mantém isolamento por organização no storage
- Continua agrupando arquivos por entidade

## Escopo

Apenas 1 arquivo alterado:
- `src/components/contacts/ContactAttachments.tsx` — ajustar a construção do `fileName` no `handleFileUpload`

Sem alterações em banco de dados, RLS, edge functions ou outros componentes. Arquivos antigos já enviados (ex.: PDFs assinados pelo SuvSign) continuam acessíveis pois o registro em `attachments.storage_path` é a fonte da verdade.

## Validação após implementar

1. Abrir uma oportunidade → aba **Anexos** → clicar **Enviar** → escolher um PDF.
2. Confirmar toast de sucesso e o arquivo listado.
3. Testar download e exclusão do arquivo recém-enviado.
