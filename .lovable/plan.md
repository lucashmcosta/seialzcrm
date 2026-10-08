# Widgets V1 — infraestrutura (Comercial + Atendimento)

Escopo: banco/RLS, registry em código, Configurações → Widgets, WidgetsTrigger no Comercial e Atendimento, fixar/desafixar por usuário, hosts Modal/Drawer, e um widget simples de teste. Oportunidades e Contatos ficam previstos no registry (contexts tipados), sem UI nesta etapa. Sem alterações em WhatsApp, dispatcher, providers ou composer.

## Regras (vêm do documento aprovado)
- Catálogo global somente no registry em código. Banco guarda só configuração.
- Sem linha no banco = widget desligado (vale para o widget e para cada tela).
- Widget novo no registry aparece automaticamente em Configurações para todos os tenants, desligado.
- Admin da organização liga o widget e configura cada tela (ligada/desligada + modo de abertura).
- Usuário fixa/desafixa apenas widgets efetivamente habilitados na tela.
- Pins de widgets desligados ou keys desconhecidas são ignorados no frontend, nunca apagados.

## Migration (para revisão — não aplicada)

```sql
-- 1) Helper de permissão: admin de configurações da org
CREATE OR REPLACE FUNCTION public.can_manage_org_widgets(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = public.current_user_id()
      AND uo.organization_id = _org_id
      AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_manage_settings')::boolean, false)
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_org_widgets(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_org_widgets(uuid) TO authenticated, service_role;

-- 2) organization_widgets
CREATE TABLE public.organization_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key text NOT NULL CHECK (widget_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, widget_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widgets TO authenticated;
GRANT ALL ON public.organization_widgets TO service_role;
ALTER TABLE public.organization_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ow_select ON public.organization_widgets FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ow_write ON public.organization_widgets FOR ALL TO authenticated
  USING (public.can_manage_org_widgets(organization_id))
  WITH CHECK (public.can_manage_org_widgets(organization_id));

-- 3) organization_widget_screens
CREATE TABLE public.organization_widget_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key text NOT NULL,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  is_enabled boolean NOT NULL DEFAULT false,
  open_mode text NOT NULL DEFAULT 'drawer' CHECK (open_mode IN ('modal','drawer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, widget_key, screen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widget_screens TO authenticated;
GRANT ALL ON public.organization_widget_screens TO service_role;
ALTER TABLE public.organization_widget_screens ENABLE ROW LEVEL SECURITY;
CREATE POLICY ows_select ON public.organization_widget_screens FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ows_write ON public.organization_widget_screens FOR ALL TO authenticated
  USING (public.can_manage_org_widgets(organization_id))
  WITH CHECK (public.can_manage_org_widgets(organization_id));

-- 4) user_widget_preferences
CREATE TABLE public.user_widget_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  pinned_widget_keys text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(pinned_widget_keys) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, screen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widget_preferences TO authenticated;
GRANT ALL ON public.user_widget_preferences TO service_role;
ALTER TABLE public.user_widget_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY uwp_own ON public.user_widget_preferences FOR ALL TO authenticated
  USING (user_id = public.current_user_id()
         AND organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (user_id = public.current_user_id()
              AND organization_id = ANY (public.current_user_org_ids()));

-- 5) updated_at (reutiliza função existente do projeto)
CREATE TRIGGER trg_ow_updated_at BEFORE UPDATE ON public.organization_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ows_updated_at BEFORE UPDATE ON public.organization_widget_screens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_uwp_updated_at BEFORE UPDATE ON public.user_widget_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Realtime apenas da configuração da org (RLS filtra por tenant)
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_widgets, public.organization_widget_screens;
```

Notas da modelagem:
- `widget_key` não tem FK (catálogo vive em código); keys stale ficam inertes.
- Pin de widget desligado é permitido no banco mas ignorado na leitura — não validamos pin no servidor porque o efeito de um pin inválido é nulo (só controla atalho visual; não dá acesso a dados). [INCERTO] se preferir validação server-side, adiciono trigger simples.
- `updated_by_user_id` é preenchido pelo frontend com `users.id`; posso trocar por trigger que força `current_user_id()` se preferir garantir server-side.
- Antes de aplicar, confirmo que `update_updated_at_column()` existe e que `can_manage_settings` é a permissão correta para "admin da organização" (alternativa: reutilizar `is_org_admin`, que usa `can_manage_users`).

## Frontend

```text
src/widgets/
  registry.ts          catálogo tipado (key, nome, descrição, ícone, telas suportadas, modos suportados, contexts)
  types.ts             WidgetScreen, WidgetContext por tela (commercial/inbox ativos; opportunities/contacts previstos)
  useOrgWidgets.ts     React Query (org) + Realtime -> mapa efetivo widget x tela
  useWidgetPins.ts     React Query (user+org+tela), upsert otimista
  WidgetsTrigger.tsx   botão na barra da conversa: fixados como atalhos + menu "Widgets" com fixar/desafixar
  WidgetHost.tsx       abre em Modal (Dialog) ou Drawer (Sheet) conforme open_mode da tela
  widgets/test-widget/ widget de teste "Contexto da conversa": mostra tela, org e conversa atual (somente leitura)
src/pages/settings/WidgetsSettings.tsx
```

- Efetivo = registry ∩ widget ligado ∩ tela ligada ∩ tela suportada pelo registry. Qualquer outra coisa é descartada.
- Configurações → Widgets: novo item no grid, visível só com `canManageSettings`, com guard na própria página. Lista todo o registry; switch do widget; por tela suportada: switch + seletor Modal/Drawer.
- Comercial: `actions` do `SalesConversationHeader`. Atendimento: controles à direita do cabeçalho em `InboxThreadDetail`. Trigger só aparece se houver ao menos um widget efetivo na tela.
- Sem polling; Realtime invalida apenas o cache de configuração da org.
- Mobile fora do escopo desta etapa.

## Documentação
- Novo `docs/modules/widgets/README.md` + `data-model.md`, linha em `docs/modules/settings/README.md`, ADR curto do modelo (registry em código + config em banco), regra em `AGENTS.md`, regeneração das referências de banco conforme ADR 0007.

## Validação
- Testes de RLS: membro comum lê config mas não escreve; admin escreve; usuário não lê/escreve pin de outro; outra org não vê nada.
- Teste do resolver efetivo (keys stale, widget desligado com pin antigo, tela não suportada).
- Verificação visual no Comercial e no Atendimento com o widget de teste em Modal e em Drawer.
