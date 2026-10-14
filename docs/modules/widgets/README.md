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
[TODO] lançadores em Oportunidades e Contatos.
