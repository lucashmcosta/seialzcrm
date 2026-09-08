# Vídeo do app rejeitado + agrupar notificações por conversa

## 1. Causa exata da falha do vídeo (já confirmada nos dados)

A mensagem de vídeo de hoje 17:42 (`a74cd9d4-6c9c-49bf-bfef-509eb286da8c`) foi salva como
`failed` com o erro real da Meta:

> (#100) Param file must be a file with one of the following types: ... video/mp4, video/3gpp.
> Received file of type 'video/quicktime'.

Ou seja:

- Não é limite de tamanho. O arquivo chegou até a Meta e foi recusado pelo **formato**.
- O app enviou o vídeo da galeria do iPhone como `.mov` (`video/quicktime`), que a Meta
  não aceita — só `video/mp4` e `video/3gpp`.
- O envio anterior de vídeo `.mp4` (inbound) e as imagens `.jpg` do mesmo dia funcionaram.
- O erro já ficou persistido e visível na conversa (efeito do ajuste anterior), então o
  "dispatch_failed" genérico é só o código da resposta HTTP; o motivo detalhado já está gravado.

Correção certa: **o app precisa exportar o vídeo em MP4/H.264** antes do upload (no seletor
de mídia do iOS, pedir exportação MP4 em vez de passar o `.mov` original). Isso é mudança no
app mobile, fora deste repositório.

### O que muda neste projeto (pequeno, defensivo)

Hoje o servidor aceita qualquer vídeo e só descobre o problema quando a Meta recusa.
Vou adicionar uma checagem antes do upload à Meta, no ramo de vídeo apenas:

- Se o tipo detectado do vídeo não for `video/mp4` nem `video/3gpp`, a mensagem é
  finalizada como `failed` com motivo claro em português
  ("Formato de vídeo não aceito pelo WhatsApp (recebido: video/quicktime). Envie em MPF4/H.264."),
  usando o helper `finishTerminal` que já existe.
- `.mov` continua sendo recusado — o objetivo é só dar a mensagem certa e não gastar upload.
- Nada muda para imagem, áudio (OGG/Opus e MP4/AAC), documento, templates ou texto.

## 2. Agrupar notificações por conversa

Em `supabase/functions/push-dispatch/index.ts`, o payload enviado ao Expo já inclui
`collapseId: job.thread_id`. Vou acrescentar, no mesmo objeto, `threadId: job.thread_id`,
que é o campo que o iOS usa para empilhar visualmente as notificações da mesma conversa.

- Uma linha adicionada; nenhum campo existente alterado ou removido.
- Fila, trigger, `notifications`, backoff, `DeviceNotRegistered` e deep links intactos.

## Validação

1. Enviar um `.mov` pelo app: mensagem vira `failed` na hora com o motivo de formato.
2. Enviar um `.mp4` pelo app: `sent` → `delivered` e reproduz na conversa.
3. Web: imagem, áudio e documento continuam funcionando (sem regressão).
4. Três mensagens seguidas do cliente: os avisos aparecem empilhados na mesma conversa no iPhone.

## Fora de escopo

- Converter `.mov` para MP4 no servidor.
- Qualquer mudança no áudio, nos outros provedores (Twilio, Evolution) ou no web.
