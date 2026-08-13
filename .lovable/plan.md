# Fase 3.1 — Fluxo de conexão WhatsApp (QR) dentro do WhatsApp Comercial

## Resposta direta à sua dúvida

O QR Code **já existe implementado**, mas **não no manager Comercial**.

Estado verificado no código:

- `supabase/functions/evolution-instance-manager/index.ts` — op `connect` já retorna `pairingCode`, `base64` e `count`, e grava `last_known_state = 'connecting'` + `last_qr_expires_at`.
- `src/components/integrations/evolution-whatsapp/EvolutionWhatsAppDialog.tsx` — já tem botão "Gerar QR Code", renderiza a imagem do QR, mostra status e permite desconectar. É usado em `IntegrationsSettings.tsx`.
- `src/hooks/useEvolutionInstances.ts` — já faz polling de 5s lendo `evolution_instances` (state + validade do QR).

O que **não** existe no manager novo (`SalesWhatsAppSettingsSection.tsx`):

- nenhum botão "Conectar WhatsApp";
- `sales-route-operations` não tem op de `connect` que devolva QR — a op `restartInstance` chama `connect` e **descarta** o QR de propósito (retorna só `pairingCode` e `hasQrCode`);
- o chip mostra o estado técnico bruto (`close`, `connecting`) e o texto "Evolution · habilitada";
- "Tornar ativo" não exige identidade confirmada.

Ou seja: infraestrutura pronta, fluxo de conexão ausente **nesta tela**. Esta fase liga as duas pontas — sem reimplementar QR.

## O que será entregue

1. **Remover jargão técnico**: nada de `close`/`open`/`connecting` na tela e remoção do chip "Evolution · habilitada" (a habilitação passa a ser implícita: se não estiver habilitada, a área Evolution simplesmente não é oferecida).
2. **Estado real legível** por instância: `Conectado`, `Conectando…`, `QR necessário`, `Desconectado`.
3. **Botão "Conectar WhatsApp"** quando não há sessão ativa (estado ≠ conectado).
4. **Modal de QR** com a imagem do QR, instruções, contador de expiração e botão "Atualizar QR".
5. **Transição automática para "Conectado" só com identidade validada**: enquanto o modal estiver aberto, o estado real é verificado periodicamente. Ao detectar `open`, o servidor sincroniza `owner_jid` + `owner_number_digits` e compara com o número esperado do endpoint. O modal fecha como sucesso **somente** quando as três condições forem booleano `true` explícito: `connected === true && identityKnown === true && identityMatchesEndpoint === true`. `null`, `undefined` ou estado indeterminado nunca contam como sucesso. Mismatch ou identidade desconhecida: o modal **não** fecha como sucesso, exibe erro explícito (`número conectado diverge do número do endpoint` / `identidade não confirmada`) e "Tornar ativo" continua bloqueado.
6. **Gate duplo em "Tornar ativo" (Evolution)**: exige **simultaneamente** identidade confirmada (`owner_number_digits` compatível com o endpoint) **e** estado real atual da instância = conectado (`open`). `activationEligible` do status é apenas apresentação da UI — a proteção real é revalidação server-side no momento do clique (ver Detalhes técnicos). Meta/Twilio mantêm o comportamento atual.

## Fora do escopo

- Nada de SQL, migração, trigger, `provision_sales_endpoint`, resolver V2 ou feature flags.
- Atendimento, Mobile e o dialog Evolution já existente permanecem intactos.
- Sem criar/excluir instâncias por esta tela (provisionamento continua sendo do suporte/admin).

## Detalhes técnicos

**Backend (`supabase/functions/sales-route-operations/index.ts`) — aditivo:**

- Nova op `connectInstance`: valida admin de integrações (`can_manage_integrations_in_org`), flag `evolution_api_enabled`, instância da própria org; chama `provider.connect(name)`; grava `last_known_state = 'connecting'` e `last_qr_expires_at`; retorna `{ pairingCode, qrBase64, count }`.
- Nova op `instanceState` (polling do modal): lê o estado real; ao detectar `open`, chama `syncEvolutionIdentity` (grava `owner_jid` + `owner_number_digits` só da resposta real do servidor) e devolve `{ state, connected, identityKnown, identityMatchesEndpoint, expectedMasked, ownerMasked }`. `connected: true` sozinho não é sucesso — o frontend exige `identityKnown && identityMatchesEndpoint !== false`.
- `status` passa a devolver, por endpoint, `activationEligible` + `activationBlockedReason`, calculados no servidor: para Evolution exige instância vinculada com `last_known_state = 'open'` **e** `owner_number_digits` igual aos dígitos do endereço do endpoint; para Meta/Twilio mantém a regra atual (vínculo ativo).
- `restartInstance` permanece como está (sem vazar QR).
- Deploy da função ao final.

**Frontend:**

- `src/hooks/settings/useSalesRouteManager.ts`: adicionar `connectInstance` (mutação) e `instanceState` (query com `refetchInterval` ativo **somente** enquanto o modal estiver aberto).
- Novo `src/components/settings/SalesWhatsAppConnectDialog.tsx`: modal do QR (imagem `data:image/png;base64,...`, instruções, expiração, "Atualizar QR"). Fecha como sucesso apenas quando `connected && identityKnown && identityMatchesEndpoint !== false`; em mismatch/identidade desconhecida mantém aberto com `Alert` destrutivo explicando o problema.
- `SalesWhatsAppSettingsSection.tsx`:
  - mapa `estado técnico → rótulo humano` (`open→Conectado`, `connecting→Conectando…`, `close`+QR válido→`QR necessário`, resto→`Desconectado`);
  - remover o chip "Evolution · habilitada";
  - botão "Conectar WhatsApp" (só admin, só quando não conectado) abrindo o modal;
  - "Tornar ativo" desabilitado quando `activationEligible === false`, com o motivo visível (sessão desconectada ou identidade não confirmada/divergente).

**Validação:** typecheck, deploy da edge function e smoke manual na tela (`/settings/integrations`): estado legível, conectar → QR → conectado automático, "Tornar ativo" bloqueado sem identidade.
