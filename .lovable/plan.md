## Problema

A refatoração recente da tela `src/pages/opportunities/OpportunityDetail.tsx` introduziu um "card horizontal estilo Divus" no topo (linhas 267–388) usando `flex items-center justify-between` numa única linha, com:

- Avatar + nome + título + badge do estágio + telefone + data (lado esquerdo)
- Botão ligar + assinatura + menu (...) + divisor + badge de status + valor em `text-xl` (lado direito)

Em viewport mobile (390px) isso quebra: os elementos do lado direito comprimem o lado esquerdo, o valor (`R$ 0`) e o status saem para baixo de forma desalinhada e o título da oportunidade fica espremido/cortado. O padding externo `px-6 py-3` e o card interno `p-4` também consomem muito espaço.

## Objetivo

Manter exatamente o layout desktop atual e adaptar apenas o comportamento mobile (sem mexer em lógica de dados).

## Mudanças

**Arquivo:** `src/pages/opportunities/OpportunityDetail.tsx`

1. **Wrapper externo do header** (linha 252): reduzir padding em mobile — `px-3 py-2 md:px-6 md:py-3`.

2. **Card horizontal (linha 269):**
   - Em mobile, virar coluna: `flex-col md:flex-row md:items-center md:justify-between`.
   - Reduzir padding interno em mobile: `p-3 md:p-4`.
   - Permitir wrap dos blocos: `gap-3`.

3. **Bloco esquerdo (avatar + infos, linha 270):** manter como está, mas garantir `w-full md:flex-1` para ocupar a largura toda em mobile.

4. **Linha 1 do bloco esquerdo (nome · título · stage, linha 278):** manter `flex-wrap`; reduzir tamanho do título em mobile (`text-sm`) — já está ok.

5. **Bloco direito (ações + valor + status, linha 314):**
   - Em mobile, virar uma segunda linha que ocupa largura total e distribui: `w-full md:w-auto flex-wrap justify-between md:justify-end`.
   - Esconder o divisor vertical (`h-6 w-px bg-border`) em mobile (`hidden md:block`).
   - Reduzir o valor em mobile: `text-base md:text-xl`.
   - Garantir que os botões de ícone (`ClickToCallButton`, `SendToSignatureButton`, menu `...`) fiquem agrupados à esquerda da segunda linha e o valor/badge à direita.

6. **Conteúdo abaixo do header (linha 392):** reduzir padding em mobile — `p-3 md:p-6`.

Nada de lógica, dados, queries ou comportamento é alterado — apenas classes Tailwind responsivas.

## Fora de escopo

- Desktop (mantém o visual atual idêntico).
- Componentes filhos (Tabs, ContactMessages, etc.).
- Outras telas.
