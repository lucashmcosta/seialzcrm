# Classificação de processos — implementação no Seialz

Spec: [SPEC.md](SPEC.md). Este arquivo registra **como** a v1 foi montada no repositório e como testar cada fase.

## Princípios

- O motor (`packages/motor-classificacao/src`) não é editado. Toda defesa fica em volta dele.
- O cálculo do vendedor roda na edge function `process-classification`. O navegador do vendedor recebe só faixa + comissão.
- Módulo por tenant: `organization_widgets` com `widget_key = 'process_classification'`. A migração **não** liga o módulo.

## Fase 1 — motor, banco e edge (servidor)

| Peça | Onde |
|---|---|
| Motor (cópia fiel do pacote) | `packages/motor-classificacao/` |
| Bundle usado pela edge (idêntico ao build, conferido no CI) | `supabase/functions/_shared/classificacao/motor.mjs` |
| Canonicalização da Entrada (whitelist, perguntas visíveis, descarta `ajusteManual`) | `supabase/functions/_shared/classificacao/canonicalizar.ts` |
| Edge function (`get_state`, `classify`) | `supabase/functions/process-classification/index.ts` + `logic.ts` |
| Migração (tabelas, RLS, RPC, seed v1/v2 da Central Trabalhista) | `supabase/migrations/20261018120000_process_classification_v1.sql` |
| Rollback | `supabase/rollback/20261018120000_process_classification_v1_DOWN.sql` |
| Permissões RBAC v2 (itens de módulo) | `src/lib/permissions/catalog.ts`, `src/lib/permissions/types.ts` |

### Tabelas

- `classification_calibration_versions`: versões por org; publicada/arquivada imutáveis; 1 publicada e 1 rascunho por org; publicar exige nota.
- `process_classifications`: entrada canônica, faixa, comissão, status (`active`/`superseded`/`voided`). Índice único: 1 ativa por oportunidade. `idempotency_key` única por org.
- `process_classification_results`: resultado completo do motor (chances, valores, score). Só `administracao.ver_numeros_classificacao`.
- `classification_correction_requests`, `classification_outcomes` (preparo da jurimetria), `process_classification_settings` (limite diário por vendedor; `NULL` = sem limite).
- `opportunity_commissions`: módulo de comissão agnóstico (`source_type` = `process_classification`, outras fontes no futuro).

O navegador só lê (RLS). Toda escrita é feita pela edge (service_role) através de `pc_record_classification`.

### Permissões (RBAC v2, aparecem no editor de perfis só com o módulo ligado)

| Chave | Família | Modelos que já vêm com ela |
|---|---|---|
| `dados.classificacoes.ver` (meus/equipe/todos) | Dados | Vendedor = meus · Líder = equipe · Gestor e Somente leitura = todos |
| `ferramentas.classificar` | Ferramentas | Vendedor, Líder, Gestor |
| `ferramentas.liberar_correcao` | Ferramentas | Líder, Gestor |
| `administracao.ver_numeros_classificacao` | Administração | só Admin |
| `administracao.calibrar_classificacao` | Administração | só Admin |
| `administracao.publicar_calibracao` | Administração | só Admin |

Perfis que já existem não ganham nada automaticamente: depois de ligar o módulo, o admin marca as chaves nos perfis da org.

### Testes

```
# motor (475) — também roda no CI
cd packages/motor-classificacao && npm ci && npm test

# canonicalização + regras da edge (Deno)
deno test supabase/functions/_shared/classificacao/canonicalizar.test.ts supabase/functions/process-classification/logic.test.ts --allow-read

# banco (Postgres descartável)
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification.sql

# permissões no front
bun test src/lib/permissions
```

## Fase 2 — widget do vendedor

| Peça | Onde |
|---|---|
| Card na Visão geral da oportunidade (carregado só com o módulo ligado) | `src/components/process-classification/ProcessClassificationSlot.tsx` → `ProcessClassificationCard.tsx` |
| Assistente passo a passo | `src/components/process-classification/ClassificationWizard.tsx`, `Campos.tsx`, `rascunho.ts` |
| Revelação (materiais, faíscas, contagem da comissão) | `src/components/process-classification/ClassificationReveal.tsx` + `materiais/*.svg` |
| Widget do Workspace (popup no desktop, `contextMode: 'opportunity'`) | `src/widgets/process-classification/`, `src/widgets/registry.ts` |
| Cores de destaque das faixas (claro/escuro) | tokens `--band-*` em `src/index.css` |
| Catálogo reduzido do vendedor + troca no bundle | `scripts/gen-catalogo-vendedor.mjs`, plugin em `vite.config.ts` |
| Checagem do bundle publicado | `scripts/check-seller-bundle.mjs` (roda no CI depois do build) |

- O navegador usa só `perguntas.ts` do motor, com o catálogo reduzido (nomes e rótulos). Calibração, explicações jurídicas e cálculo nunca vão para o bundle; o CI falha se aparecerem.
- A Entrada enviada é montada com o mesmo canonicalizador do servidor (`supabase/functions/_shared/classificacao/canonicalizar.ts`).
- "Analisando o caso…" dura pelo menos 1,5 s. Ao reabrir uma oportunidade já classificada, o resultado aparece sem animação. Com `prefers-reduced-motion`, sem animação.
- O botão "Errei alguma resposta — pedir correção ao gestor" entra na Fase 3.
- Ligar o widget em Configurações → Widgets liga o módulo na org. Sem calibração publicada, o vendedor vê "O módulo ainda não tem calibração publicada".

### Testes da Fase 2

```
bun test src/components/process-classification src/lib/permissions
bun run build && node scripts/check-seller-bundle.mjs
```

## Fase 3 — correção pelo gestor, configurações do widget e exigência para ganhar

| Peça | Onde |
|---|---|
| Migração (exigência na política, RPCs de correção e de configuração) | `supabase/migrations/20261018150000_process_classification_f3.sql` |
| Rollback (devolve o avaliador idêntico ao da e3d1) | `supabase/rollback/20261018150000_process_classification_f3_DOWN.sql` |
| Edge: `request_correction`, `decide_correction`; `get_state` diz quem pode pedir/decidir | `supabase/functions/process-classification/index.ts` |
| Botão do vendedor e painel Liberar/Recusar do gestor | `src/components/process-classification/ProcessClassificationCard.tsx`, `ResumoEntrada.tsx` |
| Configurações do widget (Geral + Calibração) | `src/components/process-classification/settings/ProcessClassificationSettings.tsx` |
| Página de configuração genérica de widgets | `src/pages/settings/WidgetSettingsPage.tsx` (`/settings/widgets/:key`) |

**Exigir classificação para ganhar = mesmo mecanismo dos documentos** (decisão do Lucas):
- A regra mora em `opportunity_close_policies.require_process_classification` (fonte única). Dá para marcar em Configurações de oportunidade (aparece com o widget ligado) ou na aba Geral do widget; os dois editam o mesmo campo.
- Vira o item "Classificação do processo" no avaliador de fechamento e segue o **modo da política**: Monitorar só avisa; Aplicar e bloquear barra pelo guard que já existe (detalhe, Kanban, lote), com o mesmo "forçar ganho" do admin.
- O item só aparece com a exigência marcada **e** o widget ligado **e** calibração publicada.
- A migração **não** liga a exigência. Em produção a política da Central Trabalhista está em Aplicar e bloquear: a exigência deve ser ligada na tela só depois que os consultores já estiverem classificando (rollout em fases).

**Correção (§6):** o vendedor pede → avisa (notificação) todos com `ferramentas.liberar_correcao` e o Admin → o gestor abre a oportunidade, vê as respostas, a faixa e a comissão → libera (a classificação atual continua valendo até a nova) ou recusa com motivo (o vendedor é avisado). Ninguém decide o próprio pedido. Com a oportunidade fechada, nada se mexe.

**Configurações** (`/settings/widgets/process_classification`):
- Aba **Geral** (quem gerencia Configurações): exigir classificação para ganhar (com o modo atual da política e link para mudá-lo), limite de classificações por vendedor em 24 h, situação da calibração.
- Aba **Calibração** (`administracao.calibrar_classificacao` ou `publicar_calibracao`, por padrão só Admin): mostra a versão publicada; edição chega na Fase 4.

```
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_f3.sql
```

## Pontos para o jurídico (não alterados no motor)

1. **"Recebeu a rescisão?" em "Sem registro".** A tela esconde a pergunta, mas o motor lê `resc` se ela vier na entrada (`motor.ts`, verbas rescisórias). Como a SPEC manda não enviar perguntas escondidas, o motor assume `nada` (verbas cheias) quando a saída é "Sem registro" e o 13º/férias eram pagos. Nos casos-ouro, 6 casos aleatórios divergem só por isso. Confirmar com o Renan se é o comportamento desejado.
