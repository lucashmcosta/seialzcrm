# Etapa D + Etapa E — Plano aprovado

Regra unificada validada em Central Trabalhista e Viagi:
`opportunity.status = 'won'` → `contact.lifecycle_stage = 'customer'` → entra no Atendimento.

---

## Etapa D — Simplificar `inboxScope.ts` (apenas frontend)

### Arquivos
- `src/hooks/inbox/inboxScope.ts` — única alteração efetiva.
- `src/hooks/inbox/useInboxThreads.ts` — apenas ajuste do `console.info` (remove `A=` do log; usa novo `ScopeDebug`).
- `src/hooks/inbox/useInboxQueueCounts.ts` — sem mudanças.
- `src/pages/inbox/InboxPage.tsx` — sem mudanças.

### Mudanças em `inboxScope.ts`
1. Remover `SELECT_A` e `fetchScopeA`.
2. `fetchInboxScopedThreads` passa a usar apenas `fetchScopeB`, com sort por `last_message_at` desc e `slice(limit)`.
3. `ScopeDebug` vira `{ bRaw, bFiltered, merged }` (campo `a` removido).
4. Cabeçalho do arquivo reescrito explicando a regra unificada.
5. `EXCLUDED_PURPOSES = ['commercial','vendor_personal']` preservado. Filtro client-side permanece (endpoint NULL/`other`/`customer_service` passam; `commercial`/`vendor_personal` saem).
6. Assinaturas públicas dos hooks (`useInboxThreads`, `useInboxQueueCounts`) preservadas.

### Não tocar
`/messages`, composer, envio, RPCs, edge functions, migrations nessa etapa, endpoints.

### Validação
- Central Trabalhista: contagens da Inbox coerentes com snapshot atual.
- Viagi: Ativos 38 / Aguardando 32 / Concluídos hoje 0.
- Console sem erros; log `[inbox] tab=… B_raw=… B_filtered=… merged=…`.
- Conferir ausência de threads com endpoint `commercial`/`vendor_personal`.

### Rollback
Reverter `src/hooks/inbox/inboxScope.ts` e o `console.info` em `useInboxThreads.ts`. Sem migration envolvida.

---

## Etapa E — Trigger `won → customer` (apenas banco)

### Arquivo
- Nova migration: `supabase/migrations/<timestamp>_opportunity_won_promotes_contact.sql`.

### SQL

```sql
CREATE OR REPLACE FUNCTION public.fn_opportunity_won_promote_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won')
     AND NEW.contact_id IS NOT NULL
     AND NEW.deleted_at IS NULL
  THEN
    UPDATE public.contacts c
       SET lifecycle_stage = 'customer',
           updated_at = now()
     WHERE c.id = NEW.contact_id
       AND c.organization_id = NEW.organization_id
       AND c.deleted_at IS NULL
       AND c.lifecycle_stage IS DISTINCT FROM 'customer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_won_promote_contact ON public.opportunities;

CREATE TRIGGER trg_opportunity_won_promote_contact
AFTER INSERT OR UPDATE OF status ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.fn_opportunity_won_promote_contact();
```

### Garantias
- Nunca rebaixa (`won → open/lost` não dispara UPDATE em contacts).
- Não toca endpoint, threads ou `/messages`.
- Idempotente (`lifecycle_stage IS DISTINCT FROM 'customer'`).
- Respeita `organization_id` e soft delete (`deleted_at IS NULL`).
- Sem composer, envio, edge function ou webhook.
- Sem RLS nova, sem RPC nova.

### Testes (sem alterar cliente real)
Preferência: usar SQL controlado em transação com `ROLLBACK`, criando contact + opportunity descartáveis numa org de teste. Esqueleto:

```sql
BEGIN;
-- 1) seed descartável
WITH c AS (
  INSERT INTO public.contacts (organization_id, full_name, lifecycle_stage)
  VALUES ('<org_test>', 'TRIGGER TEST', 'lead')
  RETURNING id
)
INSERT INTO public.opportunities (organization_id, contact_id, status, title)
SELECT '<org_test>', id, 'open', 'TRIGGER TEST' FROM c;

-- 2) ação: promover para won
UPDATE public.opportunities
   SET status = 'won'
 WHERE title = 'TRIGGER TEST' AND organization_id = '<org_test>';

-- 3) asserção: contact deve estar customer
SELECT lifecycle_stage FROM public.contacts WHERE full_name = 'TRIGGER TEST';

-- 4) regressão (não rebaixar): voltar para open
UPDATE public.opportunities SET status='open' WHERE title='TRIGGER TEST';
SELECT lifecycle_stage FROM public.contacts WHERE full_name='TRIGGER TEST';
-- esperado: ainda 'customer'

-- 5) limpar tudo
ROLLBACK;
```

Se não houver org de teste segura, validar apenas com `BEGIN; … ROLLBACK;` ou aguardar oportunidade descartável real.

### Rollback
```sql
DROP TRIGGER IF EXISTS trg_opportunity_won_promote_contact ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_opportunity_won_promote_contact();
```

---

## Fora de escopo
`/messages`, composer, envio real, endpoints, Fase 1.3C, RLS novas, RPCs novas.

## Entregáveis
1. Arquivos alterados.
2. Validação Etapa D — Central Trabalhista.
3. Validação Etapa D — Viagi (38 / 32 / 0).
4. SQL da migration Etapa E.
5. Resultado dos testes da trigger.
6. Confirmação de `/messages`, composer e envio intocados.
