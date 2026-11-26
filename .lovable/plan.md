# Desativar os 11 tokens de push de quem não tem vínculo ativo

## O que vai ser feito
Um único comando muda `is_active` para false nos tokens de `user_push_tokens` cujo dono não tem nenhum vínculo ativo em `user_organizations`. As linhas não são apagadas e continuam como histórico dos aparelhos.

```sql
UPDATE public.user_push_tokens t
   SET is_active = false, updated_at = now()
 WHERE t.is_active
   AND NOT EXISTS (SELECT 1 FROM public.user_organizations uo
                    WHERE uo.user_id = t.user_id AND uo.is_active);
```

## Conferência
- Antes: recontar. Só executo se o número bater com os 11 tokens de 7 usuários informados antes; se mudou, paro e aviso.
- Depois: confirmar que essa contagem é 0 e que as 11 linhas continuam na tabela, agora com `is_active = false`.
- Rollback: reativar pelos IDs das 11 linhas. Vou salvá-los antes de executar e mostrar a você.

## Nada mais muda
A, B, C e as três checagens já estão feitas e relatadas. Este passo só desativa esses tokens.
