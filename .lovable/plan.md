# Remover definitivamente o separador "Número alterado"

## O que encontrei no código atual

- `/commercial` renderiza `src/pages/messages/MessagesList.tsx` (mesmo componente de `/messages`), tanto desktop quanto o fluxo atual do preview.
- Nesse arquivo, no ponto onde antes existia o marcador de troca de número (linhas ~2321-2324), hoje há apenas um comentário: o marcador foi removido e só a quebra de container (`endpointBreak`) permanece.
- Nenhum outro componente da timeline renderiza esse texto: `rg` por "alterado" / "→" em `src/components/messages/**` e `src/components/mobile/**` não retorna nenhum marcador de endpoint (só "Atendente alterado", que é outro evento aprovado).
- Sobrou um resíduo: o ícone `PhoneCall01` continua importado em `MessagesList.tsx` (linha 12) sem uso — era o ícone daquele separador.

Ou seja: a regra aprovada já está no código-fonte. O que você viu no preview é a versão anterior do bundle (aba antiga/HMR não aplicado) ou a versão publicada, que ainda não recebeu esse deploy. Não consigo confirmar isso navegando pelo preview autenticado: este projeto usa Supabase externo (`external_unmanaged`), então não há sessão para abrir `/commercial` logado no sandbox.

## O que farei

1. Limpar o resíduo: remover o import não usado `PhoneCall01` e o comentário obsoleto em `MessagesList.tsx`, deixando explícito que a quebra de container por endpoint não gera marcador.
2. Reconfirmar por busca automatizada que nenhum caminho de render (desktop, mobile, modal de rota) emite texto de troca de número.
3. Rodar typecheck e a suíte de testes da timeline (`messageGrouping`) para garantir que a quebra de container por endpoint continua existindo sem marcador.
4. Entregar com a instrução de recarregar o preview com cache limpo (e publicar, se o que você validou foi a URL publicada) — sem isso, o bundle antigo continua exibindo o separador.

## Detalhes técnicos

- Arquivos tocados: `src/pages/messages/MessagesList.tsx` (apenas import/comentário; nenhuma mudança de lógica).
- Nada muda em `src/lib/messageGrouping.ts`: `endpointBreak` continua gerando novo container, e o cabeçalho `WhatsApp • (11) 5028-7020` segue sendo a única indicação do número.
- Zero alteração de regra de negócio, backend, RLS ou edge functions.
