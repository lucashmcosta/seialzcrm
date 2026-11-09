# Módulo: Widgets (V2 — Workspace)

Ferramentas abertas em janelas independentes que acompanham o usuário entre as telas internas do Seialz (desktop ≥ 768px).

## Catálogo e configuração (inalterados da V1)
- Catálogo global em código: `src/widgets/registry.ts`. Não registrar widgets de teste.
- Widgets são **globais**: por organização só `organization_widgets` (liga/desliga). Escrita exige `can_manage_settings`.
- Catálogo em `/widgets` (menu lateral, no lugar de "Central de Ajuda"; `/docs` segue acessível por URL). "Abrir" chama `ws.open` (abre/restaura/foca).
- `organization_widget_screens` ficou só por compatibilidade: não é lida nem gravada; dados preservados.
- Atalhos do Comercial/Atendimento mostram todos os widgets ligados; pins continuam por tela.
- Widget desligado na org some imediatamente de todas as telas (Realtime).
- `open_mode` (Modal/Drawer) removido da interface; coluna preservada.

## Workspace
- `WidgetWorkspaceRoot` envolve as rotas em `App.tsx`; não monta em `/admin`, `/auth`, sem sessão/org ou abaixo de 768px (sem fallback).
- Motor interno com `key = userId:orgId`: trocar de organização ou sair descarta estado, contexto e canal.
- Um único canal Realtime por org (`widget-workspace-config-<org>`), só `organization_widgets`. `useOrgWidgetConfig` não abre canal.
- Janelas: `react-rnd`, sem backdrop; a camada usa `pointer-events: none`. Uma instância por widget.
- Estados: `open`, `minimized` (dock no canto), `closed` (preserva posição/tamanho). Cabeçalho só com Minimizar e Fechar (sem "Remover").

## Persistência
- `user_widget_workspace(organization_id, user_id, layout jsonb)`, uma linha por usuário/org, RLS só do próprio usuário nas orgs ativas.
- Grava após abrir/minimizar/restaurar/fechar/remover e ao terminar arraste/redimensionamento; debounce 600ms, uma gravação por vez, sempre o estado mais recente; falha mostra aviso e tenta de novo a cada 5s. Sem `beforeunload`.
- Pins (atalhos) continuam em `user_widget_preferences`.

## Contexto
- `contextMode`: `none` (calculadora) ignora contexto; `contact`/`thread` mostram estado vazio sem contexto e remontam ao trocar de entidade. Contexto de outra org é descartado.
- Telas publicam contexto via `useWidgetContextSource` (o `WidgetsTrigger` já faz isso).

Rollback: `docs/platform/security/rbac-v2/rollback/widget-workspace-v2-2026-10-14.sql`.
- Galeria `/widgets`: cartões com `Preview` estático opcional do registry (nunca monta o widget); estado só leitura do layout.
- Widgets atuais: `overtime_calculator` (nome exibido "Central Trabalhista"; chave antiga mantida para não perder `organization_widgets`/pins. Código em `src/widgets/labor-center/`, motor puro em `calc/` (um caso = um contrato; fatos com estado confirmado/não sabe → elegibilidade, pedidos, faixa por confiança, premissas e perguntas pendentes; perguntas em `calc/facts.ts`, margens da faixa em `ESTIMATE_BANDS`, a calibrar). Estado só em memória), `tic_tac_toe` (partida em memória por `userId:orgId`; descartada ao trocar usuário/org ou sair).
- Lançador na Oportunidade (`WidgetsTrigger screen="opportunities"` no cabeçalho do detalhe); `contextMode: 'opportunity'` mostra estado vazio fora de uma oportunidade.
- Configuração por widget: `settings` no registry (import dinâmico) → botão "Configurar" em `/settings/widgets` → `/settings/widgets/:key`. Cada página faz o próprio controle de acesso.
- `process_classification` (Classificação do processo): ver `docs/classificacao-v1/IMPLEMENTACAO.md`.
- `plamev_quote` (Cotação Plamev): edge function `plamev-quote` fala com a API da Plamev (base `PLAMEV_API_BASE`, padrão produção). Cada org cola o próprio token em `/settings/widgets/plamev_quote` (exige `can_manage_settings`; testado na Plamev antes de salvar). Fica em `plamev_credentials`, cifrado com `INTEGRATION_CREDENTIALS_KEY`, e só o servidor lê. Simula sem gravar; "Gravar cotação" cria cotação real na Plamev. Venda/pagamento fora da V1: a API só aceita cartão digitado (não passar pelo CRM) e não documenta link de pagamento. `PLAMEV_CONSULTOR_ID` opcional aplica as campanhas do consultor.
[TODO] lançador em Contatos.
