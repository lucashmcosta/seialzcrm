
## Diagnóstico

O evento `Audio playback failed` (SEIALZ-1T) é gerado pelo próprio código do Seialz, em `src/lib/audioErrorReport.ts`, chamado por `AudioMessagePlayer` e `CallRecordingPlayer` sempre que um `<audio>` falha em `load`/`play`.

A dedup atual (`reportedAudioFailures: Set<string>`) só evita duplicar **dentro da mesma sessão do browser**. A cada novo usuário / nova aba / novo deploy, o Set zera e o evento volta a subir para o Sentry. Como o CRM tem muitos usuários abrindo threads com áudios (Twilio expirado, mídia Evolution ainda não baixada, formato incompatível no Safari, rede instável), o issue reaparece constantemente — é ruído esperado, não bug de produto.

Os breadcrumbs da segunda captura confirmam: o áudio quebra depois de fetches normais (`communication_endpoints`, `message_thread_reads`) — não há stack de código quebrando, é só o `<audio>` não conseguindo tocar a URL.

## O que fazer

Parar de emitir esse evento como `captureMessage` no Sentry. Manter apenas:

1. **Breadcrumb** no Sentry (`Sentry.addBreadcrumb`) com as mesmas tags/extras — assim, se um bug **real** acontecer na mesma sessão, o contexto do áudio ainda aparece no evento de verdade.
2. **`console.warn`** local para debugging via DevTools.

Efeito: o issue SEIALZ-1T para de receber eventos novos e pode ser resolvido/arquivado. Nenhum comportamento de UI muda — `RetryableAudio` / `AudioMessagePlayer` continuam mostrando o fallback "Não foi possível carregar" e o botão de retry como hoje.

## Arquivo afetado

- `src/lib/audioErrorReport.ts` — trocar `Sentry.captureMessage('Audio playback failed', { level: 'warning', ... })` por `Sentry.addBreadcrumb({ category: 'audio', level: 'warning', message: 'Audio playback failed', data: extra })` + `console.warn`. Manter a assinatura de `reportAudioFailure` e o Set de dedup intactos para não tocar nos callers (`AudioMessagePlayer.tsx`, `CallRecordingPlayer.tsx`, etc.).

Nada mais muda: sem migration, sem alteração de UI, sem tocar em `instrument.ts`.

## Depois de aplicar

No Sentry, marcar SEIALZ-1T como **Resolved** (ou Archive → "Until it happens again" com threshold alto). Se o volume voltar a subir a partir de outra fonte, ela vai aparecer como issue nova com stack real.
