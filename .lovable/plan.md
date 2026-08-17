# Refinamento visual da página "WhatsApp Comercial"

Somente apresentação. Nenhum hook de negócio, query, RPC, Edge Function, roteamento, permissão ou regra é alterado — todos os dados vêm do que `useSalesRouteManager` já carrega.

## 1. Cabeçalho da página

Em `src/pages/settings/SalesWhatsAppPage.tsx`:
- Título permanece "WhatsApp Comercial".
- Descrição passa a ser "Gerencie números, provedores e o roteamento utilizado nas conversas comerciais."
- Melhor aproveitamento horizontal: container mais largo, espaçamento mais equilibrado, menos área em branco.

## 2. Resumo administrativo no card

No topo de `SalesWhatsAppSettingsSection`, uma faixa de resumo derivada dos mesmos dados:
- total de números cadastrados;
- contagem por provedor (ex.: 2 Meta · 1 Evolution);
- número padrão da Route Comercial;
- modo de roteamento (mantido, apenas reposicionado neste bloco).

À direita do cabeçalho ficam as ações principais ("Adicionar número" e "Atualizar").

## 3. Definição de "números ativos"

O indicador "N números ativos" conta todos os números habilitados para uso na Route Comercial (vínculo ativo), independentemente do estado da conexão. O estado operacional (Conectado, QR necessário, Necessita conexão, etc.) continua exibido separadamente por linha, com os mesmos rótulos de hoje.

## 4. Lista de números mais rica

Cada linha ganha hierarquia visual melhor — número em fonte de dados, provider e estado como chips, badge de padrão quando aplicável — com padding, alinhamento, respiro e tipografia refinados. Nenhuma informação nova é introduzida.

## 5 e 6. Botões

- "Vincular número" → "Adicionar número"; botão de confirmação do formulário "Vincular" → "Adicionar". Fluxo, validações e toasts inalterados.
- Botão de refresh deixa de ser só ícone: passa a "Atualizar" com ícone, chamando o mesmo `refetch()`.

## 7. Nenhuma ação removida

Todas as ações existentes permanecem, nas mesmas condições e permissões de hoje (ex.: "Conectar WhatsApp" só quando `canManage && linkActive && !isRouteActive` e o número precisa de conexão). A mudança é apenas de posicionamento e estilo.

## 8. Badge de número padrão

O badge longo "Padrão de conversas sem histórico" passa a exibir apenas "Padrão", com a explicação completa em tooltip. Mesmo significado e mesmo comportamento.

## 9. Atalho em Integrações

Em `src/components/settings/IntegrationsSettings.tsx`, o bloco `#whatsapp-comercial` deixa de ser um card do mesmo peso das integrações e passa a uma faixa discreta (borda leve, sem sombra, texto menor) com a descrição "Gerencie os números comerciais utilizados pelo CRM." e ação "Abrir módulo →" para `/settings/whatsapp-comercial`.

## Fora de escopo

Meta, Evolution, criação de instâncias, QR Code, health check, webhook, exclusão, sincronização, providers, roteamento, endpoint padrão, regras comerciais, backend, SQL, RLS, Edge Functions, hooks, queries e permissões: intocados.

## Validação

- Typecheck limpo e build sem regressões.
- Todos os números e todas as ações continuam aparecendo.
- Resumo superior correto e derivado apenas dos dados já carregados.
- Atalho em Integrações continua levando ao módulo.
