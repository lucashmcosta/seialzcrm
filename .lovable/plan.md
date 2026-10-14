# Segundo widget: Jogo da Velha

## O que o usuário vai ver
- Em Configurações → Widgets aparece o "Jogo da Velha", desligado para todas as organizações. Isso acontece sozinho porque não existe registro ligado.
- Depois de ligado, ele aparece no catálogo `/widgets` e nos atalhos do Comercial e do Atendimento. Abre numa janela do Workspace V2, como a calculadora.
- Tabuleiro 3×3: você joga com X e o computador responde com O logo em seguida. A tela mostra de quem é a vez e, no fim, "Você venceu", "Você perdeu" ou "Empate", com a linha vencedora destacada e o botão "Jogar novamente".

## Achado técnico importante
Hoje a janela minimizada sai da tela: o Workspace só desenha as janelas abertas, e o dock mostra só um botão. Por isso, guardar a partida dentro do componente faria ela se perder ao minimizar. Como a regra é não mexer no Workspace, a partida fica guardada **no próprio módulo do jogo**, na memória da aba, separada por organização.
- Minimizar e restaurar: a partida continua.
- Navegar entre telas: a partida continua.
- Fechar e abrir de novo: a partida também continua. O pedido permite começar uma nova, mas não é obrigatório. Para recomeçar, basta "Jogar novamente".
- Recarregar a página: começa uma partida nova. Nada é salvo no banco.

## Regras do computador
- Joga sozinho cerca de 350 ms depois da sua jogada, e o tabuleiro fica travado enquanto isso.
- Ordem de decisão: ganhar se puder; senão bloquear você; senão centro; senão um canto livre; senão qualquer casa livre. Assim ele é desafiador, mas dá para vencer.
- Você sempre começa.

## Arquivos
- `src/widgets/tic-tac-toe/ticTacToe.ts` (novo): funções puras: vencedor/linha, empate, jogada do computador.
- `src/widgets/tic-tac-toe/store.ts` (novo): estado em memória por organização, com `useSyncExternalStore`.
- `src/widgets/tic-tac-toe/TicTacToeWidget.tsx` (novo): tabuleiro compacto que se ajusta ao tamanho da janela, só com tokens do design system (`bg-muted`, `text-primary`, borda de 6px, Outfit/Share Tech Mono).
- `src/widgets/registry.ts`: nova entrada `tic_tac_toe`, ícone `GridNine`, `contextMode: 'none'`.
- `tests/tic-tac-toe.test.ts` (novo): vitória em linha, coluna e diagonal; empate; computador ganha quando pode; bloqueia você; nunca joga em casa ocupada.
- `docs/modules/widgets/README.md` e `roadmap.md`.
- Sem mudanças no Workspace, nas mensagens, no composer ou no WhatsApp. Sem migrations, tabelas, Edge Functions ou dependências novas.

## Validação e limitação
- Typecheck, testes do jogo e testes atuais do layout das janelas.
- O roteiro com duas janelas (abrir as duas, arrastar, redimensionar, sobrepor e focar, minimizar as duas para o dock, restaurar cada uma, fechar uma, navegar, desligar só o jogo) precisa de sessão logada. Este projeto usa um Supabase próprio, então a prévia não aceita login automático aqui. Vou deixar um roteiro de Playwright pronto em `/tmp` e rodar a parte possível sem login, que é o jogo isolado. Para o roteiro completo, vou pedir que você o faça na prévia, ou que forneça uma conta de teste.
