# Refinamento visual da página "WhatsApp Comercial"

Somente apresentação. Nenhum hook de negócio, query, RPC, Edge Function, roteamento ou regra é alterado — os dados usados são exatamente os já carregados por `useSalesRouteManager`.

## 1. Cabeçalho da página

Em `src/pages/settings/SalesWhatsAppPage.tsx`:
- Descrição passa a ser "Gerencie números, provedores e o roteamento utilizado nas conversas comerciais."
- Título mantém "WhatsApp Comercial".
- Página ganha largura útil maior e espaçamento mais generoso (container mais largo, sem padding de página novo dentro do layout).

## 2. Cabeçalho do card + indicadores somente leitura

No card (`SalesWhatsAppSettingsSection`), à direita do título:
- "N números ativos" (derivado da lista já achatada: itens com estado conectado/elegível).
- Lista dos provedores presentes ("Meta + Evolution"), derivada de `providerRaw`.
- Modo de roteamento continua exibido como hoje, apenas reposicionado no bloco de resumo.

## 3. Faixa de resumo acima da lista

Uma linha de métricas discretas, tudo derivado dos mesmos dados:
- total de números;
- contagem por provedor (ex. 2 Meta · 1 Evolution);
- qual número é o padrão (o `isRouteActive`), com o rótulo atual encurtado para "Padrão" e o texto longo ("padrão de conversas sem histórico") movido para tooltip.

## 4. Linhas de número mais ricas

Cada item da lista passa a ter mais respiro e hierarquia visual: número em destaque (fonte de dados), provider e estado como chips, badge "Padrão" quando aplicável, e a ação "Conectar WhatsApp" alinhada à direita — exatamente as mesmas condições de exibição de hoje (`canConnect && needsConnection`), sem novas ações.

## 5. Nomenclatura dos botões

- "Vincular número" → "Adicionar número"; o botão de confirmação do formulário passa de "Vincular" para "Adicionar". O fluxo, validações e o toast de sucesso permanecem.
- Botão de refresh deixa de ser só ícone: passa a ser "Atualizar" com ícone, chamando o mesmo `refetch()`.

## 6. Atalho em Integrações mais discreto

Em `src/components/settings/IntegrationsSettings.tsx`, o bloco `#whatsapp-comercial` deixa de ser um `Card` do mesmo peso das integrações: passa a uma faixa discreta (borda leve, sem sombra, texto menor) com "Gerencie os números comerciais utilizados pelo CRM." e ação "Abrir módulo →" para a mesma rota.

## Fora de escopo

Meta, Evolution, criação de instância, QR Code, health check, webhook, exclusão, sincronização, providers, roteamento, endpoint padrão, permissões, backend e queries: intocados.

## Validação

- Typecheck limpo.
- Página renderiza os mesmos números, estados e ações; nada de query nova.
- Atalho em Integrações continua levando a `/settings/whatsapp-comercial`.
