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
- `classification_correction_requests`, `classification_outcomes` (preparo da jurimetria), `process_classification_settings` (limite de classificações **por oportunidade** em 24 h, contando as reclassificações depois de correção; padrão 2; `NULL` = sem limite).
- `opportunity_commissions`: módulo de comissão agnóstico (`source_type` = `process_classification`, outras fontes no futuro).

O navegador só lê (RLS). Toda escrita é feita pela edge (service_role) através de `pc_record_classification`.

### Permissões (RBAC v2, aparecem no editor de perfis só com o módulo ligado)

| Chave | Família | Modelos que já vêm com ela |
|---|---|---|
| `dados.classificacoes.ver` (equipe/todos) | Dados | Vendedor = **nenhum** · Líder = equipe · Gestor e Somente leitura = todos. "Meus" não dá acesso a nada: o vendedor vê a própria classificação só no widget |
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
- Aba **Geral** (quem gerencia Configurações): exigir classificação para ganhar (com o modo atual da política e link para mudá-lo), limite de classificações por oportunidade em 24 h (padrão 2), situação da calibração.
- Aba **Calibração** (`administracao.calibrar_classificacao` ou `publicar_calibracao`, por padrão só Admin): mostra a versão publicada; edição chega na Fase 4.

```
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_f3.sql
```

## Fase 3b — certificação pós-ganho

O vendedor **declara** a classificação. Depois do ganho, o Jurídico/Triagem entrevista o cliente e **certifica**: corrige o que não bateu, e o servidor recalcula com a **mesma versão de calibração** que o vendedor usou.

**Onde se certifica:** na tela do **Nammux**, junto com a ligação de entrevista, chamando a API do Seialz (decisão do Lucas, 18/10). O Seialz **não** tem tela para certificar: só guarda, aplica a regra e mostra o resultado no card. O núcleo (RPC, regras e tabelas) e a ação `certify` (com prévia) estão prontos; a API para o Nammux será planejada com o time do Nammux.

| Peça | Onde |
|---|---|
| Migração (tabelas, RPC `pc_record_certification`, permissão para o Admin) | `supabase/migrations/20261018170000_process_classification_certification.sql` |
| Rollback | `supabase/rollback/20261018170000_process_classification_certification_DOWN.sql` |
| Edge: ação `certify` (`dry_run` mostra a comparação antes de gravar); `get_state` com `certificacao`/`podeCertificar` | `supabase/functions/process-classification/index.ts`, `logic.ts` |
| Exibição do resultado da certificação no card da oportunidade (vendedor, gestor, jurídico) | `src/components/process-classification/ProcessClassificationCard.tsx` |

**Regras**
- **Só para baixo, decidido pela comissão:** comissão certificada menor → faixa e comissão passam a ser as certificadas; igual ou maior → nada muda (mérito da triagem). O cálculo certificado é sempre guardado (declarado × certificado × final). O banco impede comissão final acima da original (`pcc_final_never_up`).
- Só com a oportunidade **ganha**; sem prazo. **Uma certificação por classificação**; refazer só o **Admin** (o mínimo é sempre contra a original, então refazer pode devolver a comissão original).
- A classificação do vendedor nunca é alterada. A comissão ativa vira `superseded` e entra a nova, com `note` ("Certificação: …"). O vendedor é notificado.
- Permissão `ferramentas.certificar_classificacao` (dar ao perfil Jurídico no rollout; o Admin já tem).

**Rascunho de contrato para o Nammux (a planejar com o time deles; NÃO ligado)**
Quando a entrevista for feita no Nammux, ele envia um evento assinado pelo canal que já existe (`nammux-webhook-ingest`, HMAC por org, `schema_version: 1`):

```json
{
  "event_id": "…", "event_type": "classification.certified", "schema_version": 1,
  "source_organization_id": "…", "target_organization_id": "…", "occurred_at": "2026-…",
  "data": {
    "seialz_opportunity_id": "…",
    "entrada": { "…": "respostas certificadas, no formato da Entrada (ver canonicalizar.ts)" },
    "note": "o que a entrevista mostrou",
    "interviewer": "nome ou e-mail de quem entrevistou"
  }
}
```

Para ligar: aceitar `classification.certified` no `nammux-webhook-ingest`, canonicalizar e calcular como a ação `certify` (mesma calibração da classificação) e chamar `pc_record_certification` com `_source = 'nammux'`, `_external_actor = interviewer` e `_external_event_id = event_id`. O mesmo evento reenviado vira replay, sem gravar de novo.

```
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_certification.sql
```

## Fase 4 — calibração (aba Calibração do widget)

`/settings/widgets/process_classification` → aba **Calibração** (`administracao.calibrar_classificacao` ou `publicar_calibracao`; por padrão só o Admin).

| Peça | Onde |
|---|---|
| Edge da calibração (tudo que calcula roda aqui, com o mesmo `motor.mjs`) | `supabase/functions/process-classification-admin/index.ts` + `logic.ts` |
| Migração (rascunho com concorrência, descartar, publicar transacional) | `supabase/migrations/20261018190000_process_classification_calibration.sql` |
| Rollback | `supabase/rollback/20261018190000_process_classification_calibration_DOWN.sql` |
| Tela | `src/components/process-classification/settings/calibracao/` |

- **Editor:** Teses (as 13, com busca; cada número com o rótulo e o "porquê" do catálogo), Faixas e comissão (limites, comissões, peso do tamanho, base, 10 faixas de score e a **matriz faixa por valor × faixa de score**), Geral, Histórico. O que mudou em relação à publicada fica destacado com o valor antigo.
- **Rascunho salvo sozinho** (~800 ms). Dois admins: quem salvar com uma versão velha recebe "outra pessoa alterou" em vez de sobrescrever.
- **Simular:** o mesmo passo a passo do vendedor; resultado completo (chance, valor, detalhe e selo por tese; score, composto, faixa, comissão), calculado com o rascunho.
- **Prévia de impacto:** recalcula com o rascunho as classificações ativas dos últimos N dias (padrão 90): sobem/descem/ficam, matriz atual × nova, comissão total, por vendedor e os casos que mais mudam. Não grava nada.
- **Publicar:** o servidor confere de novo (`conferirCalibracao`), exige nota e que haja mudança; arquiva a atual e publica na mesma transação. Classificações antigas mantêm a versão e a comissão.
- **Histórico, restaurar, importar e exportar:** restaurar (versão antiga ou padrão) e importar (JSON do protótipo; lista o que foi ignorado) viram rascunho e nunca publicam direto.
- **Matriz:** o motor não exporta essa fórmula; ela é repetida no servidor e conferida contra o `calcularCaso` nos 400 casos-ouro (`logic.test.ts`).
- O navegador do admin recebe números e resultados, mas **nunca o motor nem a semente**: a checagem do bundle procura valores da semente (`score_faixas:[…`, `selo_forte:…`) e o cálculo do motor, e falha se aparecerem.

```
deno test supabase/functions/process-classification-admin/logic.test.ts --allow-read
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_calibration.sql
bun test src/components/process-classification
```

## Fase 5 — relatórios e exportação

Página **`/classificacoes`** (permissão "Ver classificações"; atalhos nos Dashboards e nas configurações do widget).

| Peça | Onde |
|---|---|
| Funções de leitura (mesma visibilidade da RLS; números só com "Ver números") | `supabase/migrations/20261018210000_process_classification_reports.sql` (`pc_report`, `pc_report_detail`, `pc_report_export`) |
| Página | `src/pages/classifications/ClassificationsReport.tsx` |
| CSV (Excel pt-BR: `;`, vírgula decimal, BOM) | `src/components/process-classification/csv.ts` |

- **Filtros:** período, vendedor, faixa, versão da calibração, só em revisão, incluir substituídas/anuladas. Resumo: total, comissão das ativas (já com a comissão final após certificação) e contagem por faixa. Paginação de 50.
- **Quem vê o quê:** só quem tem escopo **Equipe ou Todos** (o Admin tem Todos). O **vendedor nunca** acessa o relatório, o detalhe nem a exportação (mostrariam a escada de faixas e versões): vê a própria classificação só no widget, com faixa e comissão. Score e números só com `administracao.ver_numeros_classificacao`.
- **Detalhe:** respostas do vendedor, pedidos de correção, certificação e, com números, o resultado completo por tese.
- **Exportar CSV:** com números, uma linha por **classificação × tese** (versões, chance, chance automática, valor bruto e esperado, selo, aviso, faixa, comissão e certificação) — a base para comparar com a jurimetria; sem números, uma linha por classificação. Até 10 mil classificações por exportação.

```
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_reports.sql
```

## O que o vendedor vê (regra de ouro do desenho)

Só a **faixa** e a **própria comissão**, no widget da oportunidade (e, se houve certificação, a faixa/comissão final e o motivo). Nunca: chances, valores, score, calibração, a escada de faixas, versões, o cálculo certificado ou o relatório.

Garantido no banco e no servidor, não só na tela:
- RLS: o vendedor não lê resultados, calibrações, certificações (`pc_pode_ver_outros`), configurações nem desfechos.
- Relatório, detalhe e exportação (`pc_report*`) recusam quem só tem escopo "meus".
- Edge: `get_state`/`classify` devolvem só faixa e comissão; a edge da calibração recusa (403).
- Bundle: o navegador não leva motor, semente nem explicações jurídicas (checagem no CI).
- Galeria `/widgets`: prévia neutra, sem as faixas.
- Auditoria ponta a ponta com o token real de um consultor tentando todas as tabelas, funções e edges do módulo: nada além da faixa e da própria comissão.

## Pontos para o jurídico (não alterados no motor)

1. **"Recebeu a rescisão?" em "Sem registro".** A tela esconde a pergunta, mas o motor lê `resc` se ela vier na entrada (`motor.ts`, verbas rescisórias). Como a SPEC manda não enviar perguntas escondidas, o motor assume `nada` (verbas cheias) quando a saída é "Sem registro" e o 13º/férias eram pagos. Nos casos-ouro, 6 casos aleatórios divergem só por isso. Confirmar com o Renan se é o comportamento desejado.
