# Dívida técnica — 18/11/2026

Lista viva do que ficou pendente depois da rodada de melhorias do Comercial (PR #220) e da CAPI de
mensagens (PRs #212, #216, #217, #218). **Prioridade 1 é o celular**: ele está bem atrás do web.

---

## P1 — Levar para o celular o que o web já tem

"Celular" são duas superfícies, e as duas precisam disso:

- **App nativo** (React Native/Expo, outro repositório) — consome o mesmo Supabase; contexto em
  [`mobile/README.md`](../mobile/README.md) e [`MOBILE_MESSAGES.md`](../MOBILE_MESSAGES.md).
- **Web em tela pequena** — `src/components/mobile/MobileMessagesList.tsx` (ainda usa a lista antiga).

### 1. Lista de conversas: filtros, contador e card

Hoje o celular usa `rpc_list_message_threads` (v1) via `src/hooks/useMessageThreads.ts`, com só
"Todas / Para responder / Encerradas". O web passou para a v2:

- **Servidor (já pronto, só consumir):**
  - `rpc_list_message_threads_v2(p_organization_id, p_filters jsonb, p_cursor_updated_at, p_cursor_id, p_limit)`
    — página de até 50 (máx. 200), já com `ai_agent_name`, `open_stage_id`, `open_stage_name`,
    `open_opportunity_tags`.
  - `rpc_count_message_threads_v2(p_organization_id, p_filters jsonb)` — total com os **mesmos** filtros.
  - Ambas usam `fn_comercial_threads_filtered` (uma regra só). Migrações em
    `supabase/migrations/20261118020000_comercial_thread_filters_v2.sql`,
    `supabase/migrations/20261118030000_comercial_filters_idle_window.sql` e
    `supabase/migrations/20261118050000_comercial_filters_review_fixes.sql`.
- **Chaves de `p_filters`:** `view` (`open` | `to_reply` | `awaiting_client` | `resolved`), `search`,
  `endpoint_ids`, `assigned_user_ids`, `unassigned`, `handlers` (`ai` | `needs_human` | `none`),
  `opp_states` (`open` | `none` | `won` | `lost`), `stage_ids`, `opp_tag_ids`, `created_from`/`created_to`,
  `last_from`/`last_to` (ISO, fim exclusivo), `origin` (`ad` | `organic`), `ad_ids`, `unread`,
  `idle_days` (parada há mais de N dias), `window` (`open` | `closed` — janela de 24h), `thread_ids`.
- **Regras de front para reaproveitar** (web): `src/lib/commercialThreadFilters.ts` (tipos, padrão,
  leitura segura do salvo, montagem do `p_filters`, contagem, singular/plural do contador) e o hook
  `src/hooks/useCommercialThreads.ts`. Pontos que o celular precisa copiar:
  - conversa aberta **não some** quando deixa de bater com o filtro (`pinnedThread`);
  - conversa antiga atualizada **não entra no fim** da lista (quebraria o cursor do "carregar mais");
  - respostas de filtro anterior são **descartadas**;
  - tempo real em **um canal por org** (nunca refazer a cada filtro/tecla), confirmando no servidor por
    `thread_ids` em blocos de até 200, com espera máxima de 1,5 s;
  - filtros salvos **por usuário**; remover ids de número/responsável/etapa/etiqueta que não existem mais.
- **UI de referência** (web): `src/components/messages/CommercialFiltersPanel.tsx` — uma linha por
  filtro com lista de múltipla escolha; situação dentro dos filtros; etiquetas dos filtros ativos com "x";
  contador só com o número ao lado do título; sem barras de rolagem visíveis.
- **Card:** "com quem está" sempre visível ("Com &lt;IA&gt;", nome do responsável, "Pediu humano",
  **"Sem responsável"**); opcionais por usuário em "Exibir no card": etapa, etiquetas da oportunidade,
  número.

### 2. Conversa aberta

- **Data flutuante** no topo ao rolar (como no WhatsApp) — web em
  `src/components/messages/timeline/StickyDayIndicator.tsx`.
- Textos do glossário: "Encerrar conversa / Encerradas" no Comercial, "Resolver" só no Atendimento,
  "Devolver à IA" (ver [`product/terminology.md`](../product/terminology.md)).

### 3. Atalhos (ficha lateral) → equivalente no celular

Web em `src/components/messages/ficha/`:

- seções recolhíveis (Conversa e Contato abertas; Oportunidades recolhida com resumo "1 aberta · etapa");
  nota rápida e tarefas sempre visíveis;
- **CPF** consulta a Receita igual ao cadastro completo (edge function `registry-lookup` com
  `contact_id`), com ícone de situação e aviso quando pede data de nascimento;
- oportunidade com **Data de fechamento** editável e **Valor** com máscara de dinheiro
  (`src/components/common/MoneyInput.tsx` + `src/lib/moneyMask.ts`).

### 4. Perfil e menu

- Foto de perfil vai para o bucket público `user-avatars` (pasta = `auth.uid()`), salva na hora em
  `users.avatar_url`; o menu mostra a foto.
- Ícone da org guardado localmente para não "piscar" (web: `src/hooks/useOrgLogoIcon.ts`).

**Critério de pronto:** mesmos números que o web para a mesma org/usuário (comparar contador), e os
mesmos filtros salvos funcionando nas duas pontas.

---

## P2 — Demais pendências

1. **Reativação automática** das conversas paradas (Plamev ~258 sem recusa; Auxilius ~150 aguardando
   cliente): cadência com modelos aprovados (ex.: 1, 3 e 7 dias); sem resposta no fim → perda "sem
   resposta" automática. Usa os filtros `view=awaiting_client`, `idle_days` e `window=closed`.
2. **Painel de custo por mãe qualificada** nos Dashboards: gasto por anúncio (Meta) × funil do Seialz
   (qualificadas e contratos por anúncio de origem).
3. **Vínculo conversa ↔ oportunidade**: `message_threads.opportunity_id` não é preenchido (ligação só
   pelo contato). Gravar ao criar a oportunidade a partir da conversa e manter ao trocar.
4. **App Review** da permissão `whatsapp_business_manage_events` (necessária para ligar a CAPI de
   mensagens em outras empresas; hoje só vale para quem tem papel no app). Depois: plano da CAPI de
   mensagens para Central, Plamev e Viagi (Central com WABA diferente na config; Viagi sem disparo desde julho).
5. **Plamev — 4 perdas antigas sem registro** de perda (status perdido sem linha em
   `opportunity_losses`): decidir se registra.
6. **Performance de `fn_comercial_threads_filtered`**: é plpgsql com `RETURN QUERY` e monta o conjunto
   inteiro antes do `LIMIT` (≈0,4–0,6 s na Central). Avaliar SQL inlinável ou empurrar cursor/limite.
7. **Previsão de fechamento obrigatória por org** (opcional): hoje a data só é exigida ao ganhar/perder.
