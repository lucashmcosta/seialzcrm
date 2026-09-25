# Roadmap

## Áudio Meta — `audio/mp4` (AAC) do celular
- [x] Parser mínimo de boxes MP4 (`_shared/meta-whatsapp/mp4-audio-codec.ts`): `mp4a` aceita, `Opus`/`dOps` bloqueia, truncado/desconhecido fail-closed.
- [x] Guard de áudio em `meta-whatsapp-send`: ramo exclusivo MP4/M4A, normalização de aliases para `audio/mp4`, caminho OGG/Opus do Web intacto.
- [x] Testes de unidade (13 casos) + validação com arquivos reais gerados por ffmpeg (AAC faststart on/off, MP4/Opus, OGG, truncado).
- [x] Teste real: áudio M4A/AAC do app iOS enviado como `audio/mp4` → `delivered` (msg f78e516d, wamid C7D1EF8A06A19030 03).
- [x] Teste de não-regressão real: OGG/Opus do Web → `delivered` (msg 6d03cd17), MIME enviado segue `audio/ogg`.

## Peça 2 (separada, não bloqueia a Peça 1)
- [x] `finishTerminal` em `meta-whatsapp-send`: recusas terminais (415 do guard de áudio) marcam `failed` + motivo persistido; `catch` da Graph reusa o helper com semântica idêntica.
- [x] Validação em produção: recusa terminal (msg 3e70f72a) → `failed` + motivo persistido; M4A/AAC válido (5d6c3092) → `delivered`; Web OGG/Opus (09701b11) → `delivered`.

## Mobile — mídia
- [ ] Enviar/exibir os 4 tipos (áudio, vídeo, documento, vCard) com paridade de regras com o Web.
- [ ] Decisão: envio de vCard (origem — contato do CRM vs agenda do aparelho).

## Read-sync push (2026-09-22)
- [x] Conferido: push_delivery_jobs.target_url e NOT NULL -> incluir DROP NOT NULL
- [x] Conferido: user_organizations.is_active existe (boolean)
- [x] rpc_claim_push_delivery_jobs restrita a kind = message ate o dispatcher novo estar no ar
- [x] Deploy push-dispatch com ramo read_sync + filtro supports_read_sync
- [x] Liberar claim para read_sync apos o deploy
- [x] Web grava leitura via rpc_mark_thread_read (Comercial, mobile, Atendimento)
- [x] Docs
- [x] Pos-migration: validar que push de mensagem nova continua chegando (teste real no celular)
- [ ] App: publicar versao que chama rpc_register_push_token_v2 com supports_read_sync=true, trata push silencioso e limpa badge

## SuvSign V2 no Seialz Web (2026-09-24)
- [x] Fase 1 banco (signature_requests, participants, credenciais, flag OFF, RLS herdando oportunidade)
- [x] Fase 2 credenciais V2 criptografadas + testar conexão
- [x] Fase 3 edge function signature-requests
- [x] Fase 4 ramo V2 no suvsign-webhook + regressão V1
- [x] Fase 5 UI (Sheet + acompanhamento)
- [x] Fase 6 testes + estado final (flag OFF, 0 orgs)

## SuvSign V2 — fechamento pré-homologação
- [x] Paridade Nammux V2 + idempotência
- [x] Coexistência de webhooks V1/V2 (guard V1)
- [x] 11 ações, credenciais só no servidor, RLS A/B e dono
- [ ] Template do piloto — bloqueado: definir template/credencial QA
- [ ] Confirmar com a SuvSign se o webhook é por conta ou por operação

## SuvSign V2 — multidocumento (2026-09-25)
- [x] Multiseleção dinâmica, prepare multi-template, participantes por identidade real (p1..pN), 1 operação
- [ ] E2E multidocumento — aguarda segundo template QA ativo na SuvSign

## SuvSign V2 — Proposta A (2026-09-25)
- [x] Lista + detalhe, A1, A2, A3, enviado, concluído no modal V2
- [ ] Copiar link — aguarda contrato SuvSign (links não persistidos; endpoint de recuperação [INCERTO])
- [ ] Descartar rascunho — omitido até teste E2E de cancel_signature sem provider_operation_id

- [x] Proposta A master/detail do modal V2 corrigido (estilos desatualizados no preview) — validado com dados simulados; conferência com login real pendente
- [ ] E2E Copiar link V2 — aguarda operação QA pendente (hoje 0 solicitações sent/in_progress)
