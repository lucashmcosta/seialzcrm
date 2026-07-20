# Fase 0 — Discovery Evolution API (revisado com correções obrigatórias)

Objetivo: mapear contratos reais da Evolution v2.3.7 no servidor Vultr. Sem tocar em Meta/Twilio, sem alterar banco, sem persistir credencial, sem código residual — exceto `docs/integrations/evolution-api/DISCOVERY.md`.

## Guardrails

- Secrets só via `Deno.env.get(...)`. Nunca ecoados, logados ou escritos em disco.
- Zero escrita no banco Seialz.
- Nenhuma instância pré-existente é lida por nome, alterada ou apagada.
- Uma única instância temporária: `evo_discovery_<unix_ts>_<6charRand>`.
- Sem envio de mensagem, sem número real.
- Cleanup tolerante a erro (logout pode falhar sem sessão — segue para delete).
- Critério final de sucesso: instância ausente no segundo `fetchInstances` **e** função remota apagada **e** diff limpo.

## Correções aplicadas (vs plano anterior)

1. **CORS**: sem `npm:@supabase/supabase-js@2/cors`. Uso o helper local já presente no projeto (`supabase/functions/_shared/cors.ts` se existir) ou defino headers inline na própria função — sem nova dependência.
2. **Webhook não é "confirmado" em runtime**. `set`/`find` provam apenas o contrato de configuração e campos aceitos. Eventos `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE` serão classificados no doc como **"configuráveis (aceitos pela API); entrega real não confirmada nesta fase"**.
3. **TTL do QR**: sem afirmação sem observação. Faço duas leituras de `connect` com intervalo controlado (~35s) e comparo. Se inconclusivo, doc registra literal `TTL não confirmado nesta fase`.
4. **Webhook não é revertido por suposição**. Após `set`, consulto o contrato real. Se não houver operação de remoção clara e documentada pela resposta, não invento payload vazio — a exclusão da instância temporária logo em seguida garante a limpeza.
5. **Cleanup tolerante**: `logout` provavelmente 4xx (sem sessão); registro status e sigo para `delete`. Sucesso = ausência da instância no `fetchInstances` final.
6. **Sem proxy genérico**. Cada op é um case fechado com: método HTTP fixo, path montado internamente, `instanceName` validado por regex `^evo_discovery_\d+_[a-z0-9]{6}$`, body permitido por schema mínimo. **Nunca** aceitar `url`, `path` ou `method` vindos do cliente.
7. **QR não vaza**. Retornado ao caller apenas para inspeção da estrutura; **nunca** `console.log` do body; no `DISCOVERY.md` só entra: nome do campo, encoding, tamanho aproximado, prefixo redigido (`data:image/png;base64,iVBORw***REDACTED***`).
8. **Diff verificado de verdade**: `git status`/`git diff --stat` reais ao final; único caminho novo permitido é `docs/integrations/evolution-api/DISCOVERY.md`.
9. **Proteção de execução**: mantenho `verify_jwt` como está e invoco autenticado via `supabase--curl_edge_functions` (que injeta o token da sessão). Adicionalmente, a função valida um header próprio `x-discovery-token` cujo valor vem de um secret temporário `EVOLUTION_DISCOVERY_TOKEN` (gerado via `secrets--generate_secret` no início, revogado via `secrets--delete_secret` no cleanup). Defense-in-depth: mesmo que a config efetiva do deploy não exija JWT, o token adicional bloqueia execução externa.

## Sequência

1. Confirmar helper CORS existente no repo antes de escrever a função.
2. `secrets--generate_secret` → `EVOLUTION_DISCOVERY_TOKEN` (32 chars).
3. Criar `supabase/functions/evolution-discovery/index.ts` com switch fechado de ops.
4. `supabase--deploy_edge_functions(["evolution-discovery"])`.
5. Executar via `supabase--curl_edge_functions` (POST `/evolution-discovery`, header `x-discovery-token`, body `{ op, args }`), na ordem:
   1. `serverInfo` → `GET /` (versão).
   2. `fetchInstancesBefore` → `GET /instance/fetchInstances` (snapshot pré).
   3. Gera `instanceName` e valida ausência de colisão no snapshot.
   4. `create` → `POST /instance/create` com `{ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }`.
   5. `connectionState` → `GET /instance/connectionState/{instanceName}`.
   6. `fetchInstanceOne` → `GET /instance/fetchInstances?instanceName=...`.
   7. `webhookFind` → `GET /webhook/find/{instanceName}`.
   8. `webhookSet` → `POST /webhook/set/{instanceName}` com URL `https://example.invalid/discovery` (mutação; sem reversão especulativa).
   9. `connectAgain` → `GET /instance/connect/{instanceName}` (~35s depois) para inspecionar rotação do QR.
   10. `logout` → `DELETE /instance/logout/{instanceName}` (tolerar erro).
   11. `delete` → `DELETE /instance/delete/{instanceName}`.
   12. `fetchInstancesAfter` → `GET /instance/fetchInstances` (prova de remoção).
6. Redigir `docs/integrations/evolution-api/DISCOVERY.md`: versão, cada op com método/path/status/shape (redigidos), estrutura do QR (sem base64), contrato do webhook, classificação explícita de eventos como "configuráveis / entrega não confirmada", nota sobre TTL, resultado de logout+delete, diff dos snapshots.
7. Cleanup:
   - `supabase--delete_edge_functions(["evolution-discovery"])`.
   - `rm -rf supabase/functions/evolution-discovery`.
   - `secrets--delete_secret("EVOLUTION_DISCOVERY_TOKEN")`.
   - `git status` real: aceitar apenas `docs/integrations/evolution-api/DISCOVERY.md` como novo.

## Entregáveis

- `docs/integrations/evolution-api/DISCOVERY.md` (único diff).
- Confirmação textual de: função remota deletada, diretório local removido, secret temporário revogado, snapshot pós == snapshot pré (menos a temporária, que deve estar ausente).

## Fora do escopo

Envio de mensagens, migrations, mudanças em Meta/Twilio, dispatcher, UI, qualquer escrita em `communication_endpoints` / `messaging_lines` / `organization_integrations`.