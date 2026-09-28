# SuvSign V2 — seção "Tipos de documento dos modelos" não aparece

## O que foi conferido
- A seção existe e está no lugar certo: na aba **V2 — Signing Engine**, logo abaixo do quadro de chave e segredo (arquivo do modal da integração, linha 725).
- Na sessão que você enviou, a tela **não chegou a pedir a lista de modelos** ao servidor (nenhuma chamada `list_templates_admin` no registro). Ou seja, o navegador ainda estava com a versão anterior da tela aberta — a seção nem foi montada.
- O site publicado (crm.seialz.com) também ainda não tem essa mudança: ela não foi publicada.

## Passo 1 — conferir (sem mudar código)
1. Recarregar o Preview (F5 / Cmd+R), abrir Configurações → Integrações → SuvSign → aba V2.
2. Rolar o modal até abaixo de "Salvar / Testar conexão".
3. Se aparecer "Tipos de documento dos modelos": publicar o app para a equipe.

## Passo 2 — só se continuar sem aparecer
- Abrir a tela logado e ler o retorno da chamada de modelos. Se ela voltar "Sem permissão", a seção se esconde de propósito — nesse caso trocar para mostrar a mensagem em vez de sumir.
- Deixar o título da seção visível mesmo enquanto carrega ou com erro, para não parecer que ela não existe.
