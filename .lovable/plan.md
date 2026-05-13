Redesign minimalista do header da tela de detalhe de oportunidade — agrupar informações sem remover nada e refinar a hierarquia visual.

## Mudanças em `src/pages/opportunities/OpportunityDetail.tsx` (linhas 245-337)

### 1. Título mais discreto
- `text-3xl font-bold` → `text-xl font-semibold`
- Mantém destaque sem dominar a tela.

### 2. Header compacto em 2 linhas (em vez das 4 atuais)

**Linha 1 — Breadcrumb minimalista:**
- Botão "Voltar" como link discreto (ghost, sem fundo, ícone menor) à esquerda.
- Ações principais agrupadas à direita em um único bloco compacto:
  - `Editar` como botão primário pequeno (`size="sm"`).
  - `Ligar`, `Enviar para Assinatura`, `Marcar como Ganho`, `Marcar como Perdido` colapsados num menu **"Mais ações"** (DropdownMenu com ícone `DotsThreeVertical`).
  - Nada é removido — apenas reagrupado.

**Linha 2 — Título + meta unificada:**
- Título à esquerda (`text-xl`).
- À direita, badge de status + valor (`text-lg` em vez de `text-2xl`) alinhados verticalmente ao título.
- Abaixo do título, uma única linha de meta com separadores `·` (em vez de ícones repetidos): `Contato · Estágio · Data fechamento`. Ícones removidos da meta para reduzir ruído visual; texto continua clicável onde aplicável.

### 3. Ajustes de espaçamento
- `px-6 py-4 space-y-4` → `px-6 py-3 space-y-2` para densidade.
- Remover o bloco separado de ações (linha 300-335) — fundido na linha 1.

## Resultado visual esperado

```text
←  Voltar                                          [ Editar ] [ ⋯ ]
─────────────────────────────────────────────────────────────────
EMESON PINHEIRO DA SILVA                       [Aberto]  R$ 0,00
EMESON PINHEIRO DA SILVA · Novo · 13/05/2026
```

Tudo continua acessível, apenas mais limpo, com ações secundárias agrupadas no menu "⋯".

## Detalhes técnicos
- Usar `DropdownMenu` de `@/components/ui/dropdown-menu` (já no projeto).
- Tokens semânticos mantidos (`text-foreground`, `text-muted-foreground`, `border-b`).
- Sem alterações na lógica de negócio nem nas tabs/conteúdo abaixo do header.