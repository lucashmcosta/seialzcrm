## Análise objetiva

A conversa do Rafael na screenshot é a thread `2055f781-3a03-4662-a5dd-8acdb3b2aaf6`.

No banco ela está assim:

- Contato: `Rafael`
- `contact_id`: `576295e9-aaa9-4b55-bab1-790d584828ad`
- `lifecycle_stage`: `lead`
- Thread: `awaiting_client`
- `primary_endpoint_id`: `c09bd713-0225-4533-afe8-20ac07bd3a7c`
- Nosso número na thread: `+55 11 5028-7027`
- Provider: `meta_cloud_api`
- Purpose do endpoint: `customer_service`

Portanto: essa conversa aparece no Atendimento porque, para o banco, ela está vinculada ao endpoint `7027/customer_service`, não ao `7020/commercial`.

## Causa raiz

A regra atual da Inbox é:

```text
Entra no Atendimento se:
1. contato é customer e endpoint não é commercial/vendor_personal
OU
2. cs_inbox_includes_service_endpoints = true e endpoint.purpose = customer_service
```

A organização está com `cs_inbox_includes_service_endpoints = true`.

Como a thread do Rafael está com `primary_endpoint_id` apontando para o endpoint `7027/customer_service`, ela entra corretamente no Atendimento pela regra atual.

## Observação importante

A minha resposta anterior dizendo que era `7020` estava errada. Eu consultei o contato atualmente aberto na URL (`fb85044c...`), que é outro contato/thread, e não a thread do Rafael da screenshot. A auditoria correta da thread do Rafael mostra `7027`, não `7020`.

## O que precisa ser corrigido no produto

O problema real não é a regra da Inbox para essa thread específica. O problema é que a UI não mostra de forma explícita qual número nosso está sendo usado na conversa, então é fácil confundir `7020`, `7027`, `7067`, etc.

## Plano mínimo de correção

1. Exibir o número do endpoint ativo no header da conversa do Atendimento.
   - Exemplo: `Atendimento · +55 11 5028-7027 · Meta Cloud API`
   - Usar `thread.primary_endpoint.external_address`, `purpose` e `provider`, que já vêm da RPC.

2. Exibir o mesmo identificador na tela Mensagens.
   - Isso evita confundir quando uma conversa está no Comercial vs Atendimento.

3. Adicionar auditoria visual discreta na bolha/nota de migração.
   - Quando houver mensagem interna de migração de provider, mostrar de qual endpoint veio e para qual foi, quando disponível nos metadados.

4. Validar a regra de exclusividade atual.
   - Threads com endpoint `customer_service` ficam no Atendimento.
   - Threads com endpoint `commercial` ficam em Mensagens.
   - Threads com `lead + customer_service` continuam no Atendimento enquanto `cs_inbox_includes_service_endpoints = true`.

## Fora do escopo deste patch

- Não alterar roteamento automático.
- Não mover dados entre threads.
- Não mudar lifecycle do contato.
- Não alterar a regra `endpoint manda` sem uma decisão explícita posterior.