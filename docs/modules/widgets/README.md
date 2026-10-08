# Módulo: Widgets (V1)

Ferramentas abertas dentro das telas (Comercial e Atendimento nesta etapa; Oportunidades/Contatos previstos).

- Catálogo global em código: `src/widgets/registry.ts`. Todo item aparece para todos os tenants, desligado. Não registrar widgets de teste.
- Configuração por organização: `organization_widgets` (liga/desliga) e `organization_widget_screens` (tela + Modal/Drawer; FK composta com CASCADE).
- Pins por usuário: `user_widget_preferences.pinned_widget_keys` (somente o próprio usuário).
- Ausência de linha = desligado. Keys desconhecidas e pins de widgets desligados são ignorados no frontend.
- Escrita de configuração: `user_has_org_permission(org, 'can_manage_settings')`. `updated_by_user_id` é forçado por trigger.
- Realtime nas duas tabelas de configuração invalida o cache da org; widget desligado fecha na hora.
- Primeiro widget: `overtime_calculator` (estimativa simples, sem DSR/13º/férias/FGTS).
- [TODO] hosts em Oportunidades e Contatos; mobile.
