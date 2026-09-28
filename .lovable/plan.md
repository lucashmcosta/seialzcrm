# Diagnóstico — campo bloqueado com "Responder por" = Evolution 7020 (Denise)

## Causa confirmada
O número Evolution 7020 não está na lista de números que o Composer consulta para ler a regra de template. Por isso a Parte C não encontra `requires_template_outside_window` e bloqueia o campo (fail-closed).

Os dois números no banco:

| Endpoint | provider | status | sender_sid | requires_template_outside_window |
|---|---|---|---|---|
| `3ed219e0…` (7020) | evolution_api | unknown | **NULL** | **false** |
| `bf04ce63…` (7067) | meta_cloud_api | online | preenchido | true |

## Valor de cada item pedido na conversa da Denise
- `manualReply.selectedEndpointId` = `3ed219e0…` (Evolution 7020). O seletor usa uma consulta própria, sem o filtro `sender_sid`, e por isso mostra o 7020.
- Estado do `manualReply`: `ready`. Se estivesse carregando ou com erro, o seletor não mostraria o número.
- Endpoint em `useOrgWhatsAppEndpoints`: **ausente**. O hook filtra `.not('sender_sid','is',null)` e `.neq('status','offline')`, e o 7020 tem `sender_sid` NULL (número Evolution não tem SID da Twilio). Então `endpointById['3ed219e0…']` = undefined.
- Valor de `requires_template_outside_window` lido pelo Composer: `undefined`. No banco é `false`.
- `resolveComposerCapability` → `{ endpointId: '3ed219e0…', requiresTemplateOutsideWindow: true }`, porque o valor ausente é tratado como fail-closed.
- `composerAllowsFreeformOutsideWindow` = `false`.
- Condição que bloqueia: `outOfWindow = !serviceWindow.isOpen && messages.length > 0 && !composerBypassesWindow` = verdadeira. O texto "Fora da janela 24h" vem de `serviceWindow.reason`.

Hipótese descartada: não é problema de carregamento nem de o seletor escolher outro número. A decisão está certa; faltava o dado.

Observações:
- Não consegui abrir o Preview logado: este projeto usa um banco próprio, sem sessão de teste. Os valores acima vêm do banco e da leitura do código; bate com o que você viu na tela.
- No site publicado a Parte C ainda nem existe, porque o app não foi publicado.

## Correção proposta (aguarda aprovação)
Ler a regra de template da mesma lista que alimenta o "Responder por", sem mexer no filtro de `useOrgWhatsAppEndpoints` (esse filtro é usado em outras partes: badges, templates, números oficiais).

1. Em `useManualReplyEndpoint`, incluir `requires_template_outside_window` na consulta de números e no objeto de cada opção (`ManualReplyOption.requiresTemplateOutsideWindow: boolean | null`).
2. Expor `selectedOption` (já existe) com esse campo.
3. Em `resolveComposerCapability`, com a feature ligada, ler a regra de `manualReply.selectedOption` (o mesmo número que o seletor mostra), não de `endpointById`. Continua tudo fail-closed: seletor não pronto, sem opção, ou valor diferente de `false` → exige template.
4. O caminho legado com a feature desligada fica igual. Também não mudam `composerEndpointId`, o envio (dispatch), os templates nem o filtro de `useOrgWhatsAppEndpoints`.

## Validação depois da correção
Pure test e, se possível, conferência visual sua na conversa da Denise:
- sem seleção manual → 7020 → campo liberado;
- manual 7020 → liberado;
- manual 7067 → exige template;
- conversa Meta fora de 24h → bloqueada;
- seletor carregando ou número sem a regra → bloqueado.
Depois publicar o app.
