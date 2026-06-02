## Objetivo
Remover o valor técnico `other` da UI de Atendimento e humanizar o display de `primary_endpoint.purpose`. Mudança puramente visual em `InboxThreadDetail.tsx`.

## Mudanças

### 1. Criar helper local de label
No topo de `src/components/inbox/InboxThreadDetail.tsx`, adicionar:

```ts
function purposeLabel(purpose: string | null | undefined): string | null {
  if (!purpose) return null;
  const map: Record<string, string> = {
    commercial: 'Comercial',
    vendor_personal: 'Vendedor pessoal',
    customer_service: 'Atendimento',
    support: 'Atendimento',
  };
  if (purpose === 'other') return null;
  return map[purpose] ?? null; // valores desconhecidos: esconder
}
```

### 2. Header — chip do purpose
Substituir o bloco que renderiza `{endpointPurpose && (<span>...{endpointPurpose}</span>)}` por:

```tsx
{purposeLabel(endpointPurpose) && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
    {purposeLabel(endpointPurpose)}
  </span>
)}
```

Resultado: quando `purpose` for `other`, `null` ou desconhecido → nenhum chip aparece, liberando espaço para o nome e o `WhatsAppWindowChip`.

### 3. Painel lateral — trocar "Endpoint" por "Canal"
Hoje:
```
<dt>Endpoint</dt>
<dd>{endpointPurpose || '—'}</dd>
```

Trocar por uma linha "Canal" mais humana:
- Base: `Canal: WhatsApp` (quando `thread.channel === 'whatsapp'`; senão usar o nome do canal capitalizado, fallback `—`).
- Se `purposeLabel(endpointPurpose)` existir, anexar: `WhatsApp · Comercial` / `WhatsApp · Vendedor pessoal` / `WhatsApp · Atendimento`.
- Nunca exibir `other` nem valores brutos.

```tsx
<dt className="text-muted-foreground">Canal</dt>
<dd className="text-foreground">
  {(() => {
    const channel = thread.channel === 'whatsapp' ? 'WhatsApp' : (thread.channel || '—');
    const label = purposeLabel(endpointPurpose);
    return label ? `${channel} · ${label}` : channel;
  })()}
</dd>
```

Também remover a linha duplicada `Canal` que já existe mais abaixo em "Dados da conversa" (passa a ser redundante), OU manter apenas uma das duas — proposta: **remover a linha "Endpoint" e manter o "Canal" existente em "Dados da conversa"**, movendo a lógica humanizada para lá. Isso evita duplicação.

Final do painel "Atendimento":
- Remover completamente o par `<dt>Endpoint</dt><dd>...</dd>`.

Em "Dados da conversa", substituir:
```tsx
<dd>{thread.channel || '—'}</dd>
```
por:
```tsx
<dd>
  {(() => {
    const channel = thread.channel === 'whatsapp' ? 'WhatsApp' : (thread.channel || '—');
    const label = purposeLabel(endpointPurpose);
    return label ? `${channel} · ${label}` : channel;
  })()}
</dd>
```

## Fora do escopo
- `inboxScope.ts`, hooks, backend, schema do banco.
- `WhatsAppWindowChip`, SLA chip, lifecycle chip.
- Outras telas (lista do inbox, mobile, etc.).

## Arquivo afetado
- `src/components/inbox/InboxThreadDetail.tsx` (apenas).
