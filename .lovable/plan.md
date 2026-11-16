# Falsos alarmes do Sentry vindos da pré-visualização (Auth e Organização)

## O que está acontecendo
Os dois erros ("useAuthContext must be used within an AuthProvider" e "useOrganizationContext must be used within an OrganizationProvider") são do mesmo tipo. Os dois vêm da pré-visualização do editor, no momento em que ela se atualiza sozinha depois de uma mudança no código. Nessa hora, o arquivo de login/organização é recarregado. As partes que dependem dele (Widgets, Telefonia) ficam por um instante sem encontrá-lo e quebram. Recarregar a página resolve. Quem usa o sistema publicado não é afetado. A ordem no app está correta.

## O que muda
1. Separar a "caixa" dos contextos de login e de organização em arquivos próprios, que não são recarregados nessas atualizações. Assim, Widgets e Telefonia não quebram mais.
2. O Sentry passa a receber apenas erros do sistema publicado, sem os da pré-visualização.

## Fora do escopo
Login, organização, widgets, telefonia, permissões e banco continuam funcionando igual.

## Detalhes técnicos
- Novos `src/contexts/authContextObject.ts` e `src/contexts/organizationContextObject.ts`, com `createContext` e os tipos. `AuthContext.tsx` e `OrganizationContext.tsx` passam a importar deles, sem mudar os exports públicos.
- `src/instrument.ts`: `enabled: import.meta.env.PROD` no `Sentry.init`.
- Conferir o build e abrir a pré-visualização logado.
