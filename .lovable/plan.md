# Liberar SuvSign V2 somente para a Central Trabalhista

Estado atual: a flag global `signing.suvsign_v2` está OFF e não há override por organização. Central Trabalhista = `40ae935c-a7f7-4ad7-8ea4-91be6404a95f`.

## Passos
1. Migration com um único insert (ou upsert) em `integration_feature_flags`: `flag_key='signing.suvsign_v2'`, `organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`, `enabled=true`. A linha global não é alterada.
2. Consultas de verificação:
   - a linha global continua `enabled=false`;
   - existe exatamente 1 override com `enabled=true`, e ele pertence à Central Trabalhista;
   - `fn_feature_flag_enabled('signing.suvsign_v2', <central>)` retorna true;
   - uma amostra de outras organizações retorna false.
3. `get_capability` passa a resolver V2 porque usa a mesma `fn_feature_flag_enabled` (em até 60 s, por causa do cache).

Nada muda em código, credenciais, webhook ou V1. Nenhuma operação é criada e nenhum documento é enviado.

Rollback: `enabled=false` nessa linha.
