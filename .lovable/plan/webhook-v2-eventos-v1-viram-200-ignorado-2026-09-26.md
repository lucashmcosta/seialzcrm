# Webhook V2: eventos V1 viram "200 ignorado"

## Mudança
Em `supabase/functions/suvsign-v2-webhook/index.ts`, na linha 19, só a resposta muda:

```text
antes:  if (payload?.engine !== "v2") return json({ error: "not_v2" }, 400);
depois: if (payload?.engine !== "v2") return json({ ok: true, skipped: "not_v2" }, 200);
```

- O guard continua no mesmo lugar: antes de `operation_id`, do banco, de `signature_requests`, do secret e do HMAC. Nada é gravado.
- JSON inválido, `operation_id` ausente, assinatura inválida e operação desconhecida continuam com os mesmos erros de hoje.
- Não mexo no V1, no Nammux, no schema nem nos templates, e não crio operação.

## Validação
1. Repetir o teste local, com banco e SuvSign simulados:
   - Casos A e B (document.completed, document.sent e signatory.signed): esperado 200 `skipped` e zero chamadas.
   - Caso C (V2 válido): segue para a busca em `signature_requests`.
2. Publicar somente `suvsign-v2-webhook`.
3. Anotar em `docs/integrations/suvsign-v2.md` que eventos V1 recebem 200 `skipped`, como o V1 já faz com eventos V2.
