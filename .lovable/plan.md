# Erro "useOrganizationContext must be used within an OrganizationProvider"

## O que está acontecendo
O erro não acontece para os usuários do sistema publicado. O rastro mostra que ele veio da pré-visualização do editor, no momento em que o código é atualizado ao vivo (recarga automática após uma alteração). Nessa hora, o arquivo da organização é recarregado e cria uma "nova" caixa de contexto, enquanto a parte de telefonia ainda procura a antiga. Por um instante ela não encontra a organização e quebra. Um recarregamento da página resolve sozinho. A ordem no app está correta (organização envolve telefonia).

## O que muda
1. Separar a "caixa" do contexto de organização em um arquivo próprio, que não é recarregado quando o resto muda. Assim a atualização ao vivo não quebra mais a telefonia.
2. Não enviar ao Sentry erros vindos da pré-visualização de desenvolvimento (só produção), para não poluir o painel com falsos alarmes.

## Fora do escopo
Telefonia, permissões, banco e comportamento das telas continuam iguais.

## Detalhes técnicos
- Novo `src/contexts/organizationContextObject.ts` com `createContext` + tipo `OrganizationContextType`; `OrganizationContext.tsx` importa de lá (exports públicos inalterados).
- `src/instrument.ts`: só chamar `Sentry.init` quando `import.meta.env.PROD` (ou `enabled: import.meta.env.PROD`).
- Verificar build e abrir a pré-visualização para confirmar que nada quebrou.
