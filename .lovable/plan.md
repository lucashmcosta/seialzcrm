# Conectar o Seialz à conta real da Central (V2) — sem E2E

## Formulário seguro: é o cartão que já existe
A chave V2 fica guardada por organização, cifrada (AES-GCM), dentro do Seialz. Por isso o formulário seguro certo é o cartão **"SuvSign — novo fluxo de assinatura (V2)"**, em **Configurações > Integrações**. Os cofres de segredos do projeto não servem aqui, porque valem para todas as organizações e não para a Central.

Esse cartão:
- tem campos de senha, sem preenchimento automático;
- limpa os campos depois de salvar;
- mostra depois só os 4 últimos dígitos da chave e "segredo configurado";
- só grava na organização em que você está logado.

## Passos
1. **Você:** entre como administrador da Central, abra Configurações > Integrações > cartão SuvSign V2 e cole:
   - "Nova chave de API": `Seialz Central V2`;
   - "Novo segredo do webhook": o secret da Central.

   Depois clique em **Salvar**. Não clique em "Testar conexão", porque ele grava o resultado do teste. Não mande os valores no chat.
2. **Eu, só leitura no banco:**
   - confirmo que a credencial da Central foi atualizada e que a chave final mudou de `…6016` para outra;
   - confirmo que o valor está cifrado (formato `v1:`), sem mostrar nada dele;
   - confirmo que a V1 não mudou (data e campos iguais aos de 13/03);
   - confirmo que o piloto está ON e a flag principal OFF;
   - confirmo que nenhuma solicitação nova foi criada.
3. **Templates:** não consigo entrar como usuário da Central daqui. A conferência é feita por você: abra "Enviar contrato V2 (Piloto)" > "Novo envio" e confira se aparecem Procuração, Contrato Unificado e Contrato Unificado 2 disponíveis, e Contrato desabilitado (invalid_fields). Se aparecer `QA-LEGACY Procuração`, pare. A lista vem direto da SuvSign, e o Seialz não decide a compatibilidade.
4. As definições V2 dos 3 compatíveis só são lidas no preparo. Nesta rodada ficam **não verificadas pelo Seialz**, porque você já confirmou do lado da SuvSign.

## Não faço
Não altero código, schema, V1, flags ou a SuvSign. Não crio solicitação ou operação, não envio documento, não gero link e não mando e-mail.

## Entrega
Relatório com os 12 itens. Os itens 4 a 8 dependem do seu print ou da sua confirmação na tela.
