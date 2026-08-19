# Auditoria e prova de carregamento do audio probe

## Diagnóstico confirmado

1. **Objeto correto:** `window.__audioProbe`. `window.__probe` nunca foi definido pelo código (`src/lib/dev/audioProbe.ts:267`).
2. **Import dinâmico no código atual:** existe como literal `import("./lib/dev/audioProbe")` em `src/main.tsx:210`; Vite/Rollup consegue descobri-lo estaticamente e gerar seu chunk.
3. **Execução do `main.tsx`:** no runtime local da revisão atual, o trecho executou antes do redirecionamento para login e criou `window.__audioProbe`; foram observados `AUDIO_PROBE_ACTIVATION` e o log atual de carregamento.
4. **Bundle publicado:** o JavaScript atualmente servido por `https://seialzcrm.lovable.app` não contém `AUDIO_PROBE_ACTIVATION`, `AUDIO_PROBE_LOADED`, `AUDIO_PROBE_LOAD_FAILED`, `__audioProbe` nem referência a um chunk `audioProbe`. Portanto, **o código publicado não é a revisão auditada** e não pode carregar o probe.
5. **Bundle do preview hospedado:** a URL privada redireciona uma requisição sem sessão para o auth bridge da Lovable; assim, a presença do probe no bundle interno autenticado ainda não foi provada por inspeção HTTP externa. A ausência dos três logs na sessão do usuário é compatível com uma revisão de preview anterior à instrumentação.
6. **Tree shaking:** não é a causa no código atual. O import literal é alcançável e o módulo exporta `installAudioProbe`, chamada após o import. Se a revisão tivesse sido empacotada, o módulo/chunk ou seu conteúdo estaria referenciado no entry bundle.
7. **Catch:** somente o `.catch` de `src/main.tsx:212` recebe falhas do import e hoje imprime `AUDIO_PROBE_LOAD_FAILED`; não há outro catch envolvendo o loader. A ausência até de `AUDIO_PROBE_ACTIVATION` prova que a falha acontece antes do import — revisão sem o loader ou ativação não detectada — e não dentro desse catch.
8. **Iframe/query string:** o preview pode estar envolvido por uma superfície de autenticação/iframe, mas perda da query não está confirmada como causa. O loader atual já tenta `search`, `hash`, `parent.location.search` quando same-origin e `localStorage`; uma revisão que realmente contenha esse código deve registrar ativação por pelo menos um desses meios.

## Alteração mínima

Sem tocar em `AudioMessagePlayer.tsx`:

1. Em `src/main.tsx`, assim que a ativação for detectada e **antes** do `import()`, imprimir exatamente:
   ```text
   AUDIO_PROBE_LOADED
   ```
2. No `.then()` do import, antes de instalar o probe, imprimir exatamente:
   ```text
   AUDIO_PROBE_IMPORTED
   ```
3. Em `installAudioProbe()`, criar `window.__audioProbe` e imediatamente depois imprimir exatamente:
   ```text
   AUDIO_PROBE_INSTALLED
   ```
4. Preservar `AUDIO_PROBE_LOAD_FAILED` no único catch do import, para distinguir falha de chunk de falha de ativação.
5. Não alterar listeners, reprodução, carregamento de mídia, cálculo de progresso ou qualquer arquivo do player.

## Validação bloqueante

- Confirmar no build gerado que o entry bundle contém `AUDIO_PROBE_LOADED`, `AUDIO_PROBE_IMPORTED` e referência ao chunk do probe.
- Confirmar que o chunk contém `AUDIO_PROBE_INSTALLED` e `__audioProbe`.
- Abrir `/commercial?audioProbe=1` no runtime da revisão e verificar a ordem exata:
  ```text
  AUDIO_PROBE_LOADED
  AUDIO_PROBE_IMPORTED
  AUDIO_PROBE_INSTALLED
  ```
- Verificar `typeof window.__audioProbe === "object"` e `typeof window.__probe === "undefined"`.
- Comparar os hashes/markers do preview e do publicado; não afirmar que o publicado possui a correção enquanto ele continuar servindo o bundle antigo.

## Escopo técnico

- **Módulo afetado:** instrumentação temporária do módulo Messages/Comercial.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/README.md`, `docs/operations/audio-telemetry.md`, `docs/operations/conflicts.md`, drift recente e documentação de deployment.
- **ADR aplicável:** nenhum ADR exige mudança; ADR de separação Inbox/Messages é respeitada.
- **Banco/RLS/Edge Functions/integrações/multi-tenancy:** não afetados.
- **Arquivos previstos:** somente `src/main.tsx` e `src/lib/dev/audioProbe.ts`.