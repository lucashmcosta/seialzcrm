## Problema

Os secrets `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN` já estão salvos no projeto (confirmado via `fetch_secrets`), mas a edge `meta-whatsapp-platform-status` ainda retorna `false` para os dois. Isso significa que o runtime das edge functions ainda não recarregou o ambiente com os novos secrets.

```
curl .../meta-whatsapp-platform-status
→ {"appSecretConfigured":false,"verifyTokenConfigured":false,"webhookActive":false}
```

## Causa

No Supabase, secrets recém-criados só aparecem em `Deno.env.get(...)` depois que cada função é redeployada (o runtime cacheia o env no boot da função).

## Ação (1 passo)

Forçar redeploy das duas funções que leem esses secrets, sem alterar lógica:

1. `meta-whatsapp-platform-status` — toca o arquivo para regerar deploy (bump de comentário de versão no topo).
2. `meta-whatsapp-webhook` — mesmo bump, para que o handshake GET e a validação HMAC passem a enxergar os secrets.

Nenhuma outra mudança de código, schema ou config. Após o redeploy:

- O painel admin (`/admin/integrations/.../Configuração da Plataforma`) deve mostrar os 3 itens como **Configurado / Ativo** em até 15s (o `useQuery` faz refetch a cada 15s).
- Verificação manual: `curl .../meta-whatsapp-platform-status` deve devolver `{"appSecretConfigured":true,"verifyTokenConfigured":true,"webhookActive":true}`.

Se mesmo após o redeploy continuar `false`, investigo se houve falha de propagação no lado do Supabase (raro) antes de mexer em qualquer outra coisa.