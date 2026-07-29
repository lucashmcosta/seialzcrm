# Rollout Seialz ↔ Nammux v2

## Pré-condições

1. Reconciliar o histórico de migrations local/remoto dos dois projetos. Não executar `db push` enquanto a lista continuar divergente.
2. Fazer backup dos schemas e das tabelas de integração.
3. Configurar um `INTEGRATION_CREDENTIALS_KEY` diferente e com pelo menos 32 caracteres em cada projeto.
4. Configurar `NAMMUX_ALLOWED_WEBHOOK_HOSTS` no Seialz e `SEIALZ_ALLOWED_HOSTS` no Nammux.
5. No Nammux, configurar o mesmo `CRON_SECRET` no Edge Runtime e no Vault como `integration_cron_secret`.

## Reconciliação não destrutiva do histórico

Os repositórios possuem migrations locais antigas com timestamps diferentes dos
registrados no banco. Não usar `migration repair`, `--include-all` ou um `db
push` diretamente do diretório de trabalho.

O procedimento validado é:

1. Criar um diretório temporário com o `config.toml` e o vínculo do projeto.
2. Executar `supabase migration fetch --linked` nesse diretório para reconstruir
   o histórico real armazenado no banco.
3. Copiar para esse diretório somente as migrations novas da integração.
4. Executar `supabase db push --dry-run`.
5. Prosseguir somente se a saída contiver exatamente:
   - Nammux:
     - `20260729100000_seialz_multitenant_sync_foundation.sql`
     - `20260729101000_seialz_contact_patch_and_conflicts.sql`
     - `20260729102000_secure_integration_crons.sql`
   - Seialz:
     - `20260729100000_nammux_sync_v2_foundation.sql`

Em 29/07/2026, esse dry-run foi executado contra os projetos vinculados e
retornou exatamente essa lista. As mesmas migrations também foram aplicadas com
sucesso em bancos Docker temporários construídos a partir de dumps sem dados dos
schemas remotos atuais.

Os projetos vinculados `Nammux` e `Seialz DB` são os bancos principais. Não há
uma branch saudável de staging disponível; portanto, qualquer aplicação remota
deve ser uma decisão explícita de rollout em shadow mode.

## Ordem de ativação

1. Aplicar as migrations e publicar as novas Edge Functions mantendo a Central Trabalhista em `shadow`.
2. No Seialz, cadastrar um segredo compartilhado e copiar o `key_id` apresentado.
3. No Nammux, cadastrar o mesmo segredo e o mesmo `key_id`.
4. Configurar:
   - Seialz: webhook Nammux, Organization ID Nammux e URL do aplicativo.
   - Nammux: Organization ID Seialz, base URL e webhook de retorno Seialz.
5. Executar “Testar conexão” no Seialz.
6. Conferir shadow logs, identidade dos contatos e cardinalidade oportunidade/processo.
7. Ativar `live` apenas para a Central Trabalhista.

## Reconciliação

Invocar `nammux-reconcile-opportunities` primeiro com:

```json
{
  "organization_id": "40ae935c-a7f7-4ad7-8ea4-91be6404a95f",
  "dry_run": true,
  "limit": 50
}
```

Revisar a lista e repetir com `dry_run: false`. A reconciliação usa eventos canônicos de replay e reaproveita os vínculos existentes.

## Critérios de liberação

- Nenhum evento ou log de uma organização é visível por outra.
- Contatos existentes recebem dados não vazios sem alterar campos exclusivos do Nammux.
- CPF/CNPJ divergente entra em conflito sem criar vínculo ou processo parcial.
- Reenvios reutilizam exatamente o mesmo processo.
- Alterações de fase/status aparecem na aba Nammux e não movimentam o pipeline comercial.
- Cron, dispatcher e reaper recusam chamadas sem `CRON_SECRET`.
