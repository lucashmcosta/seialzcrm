# Nammux (ERP)

**Referência técnica:** `docs/audit/04-integracoes/nammux.md`.

## Finalidade
Integração com ERP Nammux para sincronizar oportunidades e anexos.

## Edge functions
- `nammux-test-connection`
- `nammux-audit` — ⚠ ainda chama `httpbin.org` (dívida — remover).
- `nammux-replay-opportunity`
- `nammux-reconcile-opportunities`
- `nammux-download-attachment`

## Documentos pós-venda

Documentos vinculados diretamente a uma oportunidade já ganha geram um replay
focado pelo outbox quando `include_opportunity_attachments` está habilitado. A
chave é determinística por documento e o trigger não faz chamadas de rede. Ver
[ADR-0010](../../decisions/0010-post-win-document-sync.md).

Contratos assinados confirmados pelo SuvSign são documentos do contato. Um
único arquivo é incluído em todas as oportunidades ganhas desse contato e cada
replay reutiliza o mesmo `document.id`, permitindo que o Nammux mantenha um
documento canônico com vários vínculos de processo. Arquivos manuais não são
promovidos a contrato pela simples correspondência do nome.

## Autenticação
Credenciais por org em `organization_integrations` (cifradas).

## Dívida
Documentos comuns vinculados somente ao contato ainda exigem uma política
explícita de roteamento quando o contato possui vários processos. A exceção
deliberada são contratos SuvSign, conforme ADR-0010. Ver também
`docs/audit/07-divida-tecnica.md`.
