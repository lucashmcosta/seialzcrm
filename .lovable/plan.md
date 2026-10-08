# Widgets V1 — infraestrutura (Comercial + Atendimento)

Escopo: banco/RLS, registry em código, Configurações → Widgets, WidgetsTrigger no Comercial e Atendimento, fixar/desafixar por usuário, hosts Modal/Drawer, e um widget simples de teste. Oportunidades e Contatos ficam previstos no registry (contexts tipados), sem UI nesta etapa. Sem alterações em WhatsApp, dispatcher, providers ou composer.

## Regras (vêm do documento aprovado)
- Catálogo global somente no registry em código. Banco guarda só configuração.
- Sem linha no banco = widget desligado (vale para o widget e para cada tela).
- Widget novo no registry aparece automaticamente em Configurações para todos os tenants, desligado.
- Admin da organização liga o widget e configura cada tela (ligada/desligada + modo de abertura).
- Usuário fixa/desafixa apenas widgets efetivamente habilitados na tela.
- Pins de widgets desligados ou keys desconhecidas são ignorados no frontend, nunca apagados.

## Permissão confirmada
`can_manage_settings` é o critério atual de Configurações: o menu de Configurações em `Layout.tsx` é liberado por `canManageSettings`, e as policies recentes (origens comerciais, regras de fechamento, identidade regional) usam `public.user_has_org_permission(organization_id, 'can_manage_settings')`. A migration reutiliza essa função existente em vez de criar helper novo ou usar `is_org_admin`.

## Migration final (para revisão — não aplicada)

```sql
-- 1) organization_widgets
CREATE TABLE public.organization_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key text NOT NULL CHECK (widget_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_widgets_org_key_uniq UNIQUE (organization_id, widget_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widgets TO authenticated;
GRANT ALL ON public.organization_widgets TO service_role;
ALTER TABLE public.organization_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ow_select ON public.organization_widgets FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ow_insert ON public.organization_widgets FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ow_update ON public.organization_widgets FOR UPDATE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ow_delete ON public.organization_widgets FOR DELETE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));

-- updated_by_user_id forçado pelo banco (ignora valor enviado pelo cliente)
CREATE OR REPLACE FUNCTION public.fn_organization_widgets_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by_user_id := public.current_user_id();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by_user_id := OLD.updated_by_user_id; -- service_role não falsifica autoria
  ELSE
    NEW.updated_by_user_id := NULL;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_organization_widgets_stamp
  BEFORE INSERT OR UPDATE ON public.organization_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_organization_widgets_stamp();

-- 2) organization_widget_screens (FK composta com CASCADE)
CREATE TABLE public.organization_widget_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  widget_key text NOT NULL,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  is_enabled boolean NOT NULL DEFAULT false,
  open_mode text NOT NULL DEFAULT 'drawer' CHECK (open_mode IN ('modal','drawer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_widget_screens_uniq UNIQUE (organization_id, widget_key, screen),
  CONSTRAINT organization_widget_screens_widget_fk
    FOREIGN KEY (organization_id, widget_key)
    REFERENCES public.organization_widgets (organization_id, widget_key)
    ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widget_screens TO authenticated;
GRANT ALL ON public.organization_widget_screens TO service_role;
ALTER TABLE public.organization_widget_screens ENABLE ROW LEVEL SECURITY;
CREATE POLICY ows_select ON public.organization_widget_screens FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ows_insert ON public.organization_widget_screens FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ows_update ON public.organization_widget_screens FOR UPDATE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ows_delete ON public.organization_widget_screens FOR DELETE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE TRIGGER trg_organization_widget_screens_updated_at
  BEFORE UPDATE ON public.organization_widget_screens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) user_widget_preferences (somente o próprio usuário)
CREATE TABLE public.user_widget_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  pinned_widget_keys text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(pinned_widget_keys) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_widget_preferences_uniq UNIQUE (organization_id, user_id, screen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widget_preferences TO authenticated;
GRANT ALL ON public.user_widget_preferences TO service_role;
ALTER TABLE public.user_widget_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY uwp_own ON public.user_widget_preferences FOR ALL TO authenticated
  USING (user_id = public.current_user_id()
         AND organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (user_id = public.current_user_id()
              AND organization_id = ANY (public.current_user_org_ids()));
CREATE TRIGGER trg_user_widget_preferences_updated_at
  BEFORE UPDATE ON public.user_widget_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Realtime só da configuração da org (RLS filtra por tenant)
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.organization_widgets, public.organization_widget_screens;
```

Notas da modelagem:
- `widget_key` em `organization_widgets` não tem FK (catálogo vive em código); keys stale ficam inertes.
- Tela só existe se o widget existir na org; apagar o widget apaga suas telas (CASCADE).
- Pin de widget desligado é aceito no banco e ignorado na leitura (não concede acesso a dados).

## Frontend

```text
src/widgets/
  registry.ts          catálogo tipado (key, nome, descrição, ícone, telas suportadas, modos suportados, contexts)
  types.ts             WidgetScreen, WidgetContext por tela (commercial/inbox ativos; opportunities/contacts previstos)
  useOrgWidgets.ts     React Query (org) + Realtime -> mapa efetivo widget x tela
  useWidgetPins.ts     React Query (user+org+tela), upsert otimista
  WidgetsTrigger.tsx   botão na barra da conversa: fixados como atalhos + menu "Widgets" com fixar/desafixar
  WidgetHost.tsx       abre em Modal (Dialog) ou Drawer (Sheet) conforme open_mode da tela
  widgets/overtime-calculator/ primeiro widget real (ver abaixo)
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
- Verificação visual no Comercial e no Atendimento com a calculadora em Modal e em Drawer.

## Primeiro widget real — Calculadora de Horas Extras
- Key `overtime_calculator`; telas suportadas: Comercial e Atendimento; modos: Modal e Drawer.
- Calculadora local, sem gravar nada e sem enviar mensagem; nenhum dado sai do navegador.
- Sem widget dummy no registry (nada de teste chega à produção).

Regras de cálculo — [INCERTO], preciso que você defina antes de implementar:
1. Entradas: salário mensal, divisor de horas (ex.: 220), quantidade de horas extras por faixa?
2. Adicionais: 50% (dias úteis) e 100% (domingos/feriados)? Outros percentuais configuráveis?
3. Reflexos: incluir DSR, 13º, férias + 1/3 e FGTS, ou só o valor bruto das horas?
4. Período: por mês único, ou somar vários meses (ex.: até 5 anos retroativos)?
5. Saída: só valor total, ou memória de cálculo detalhada e botão copiar?
