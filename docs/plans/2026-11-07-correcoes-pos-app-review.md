# Correções pós App Review (07/11/2026)

Sete correções que sobraram do trabalho de 07/11 (App Review da Meta, credencial canônica e segurança). Regra: **uma por vez**, cada uma em PR próprio, com teste antes e depois em produção e rollback definido. A próxima só começa quando a anterior estiver validada em produção.

Ordem por risco: primeiro o que pode se perder ou ser explorado; depois o que afeta usuários; por fim os ajustes de UX.

---

## 1. Sync orgânico: levar a correção pro `main`
**Problema:** a correção do orçamento de tempo do `meta-organic-sync` (a Página do Facebook nunca recebia tempo) foi publicada em produção direto da branch `fix/organic-sync-fair-budget`, e o PR nunca foi aberto. Um deploy a partir do `main` desfaria a correção.
**Mudança:** abrir o PR com a branch rebaseada no `main` atual. Nenhuma mudança de código além da que já está no ar.
**Teste:**
- Diff do PR igual ao código em produção (comparar com a versão publicada).
- Depois do merge, republicar a partir do `main` (`--no-verify-jwt`) e disparar o sync da Viagi: a execução da Página do Facebook tem que trazer `pages > 0` e posts novos.
**Risco:** quase nenhum, porque o código já está em produção.
**Rollback:** republicar a versão anterior da função.

## 2. Desativar funções de uso único sem autenticação
**Problema:** a auditoria (`docs/platform/security/verify-jwt-review.md`) lista funções de escrita em massa que qualquer um pode chamar: `backfill-attribution`, `ct-backfill-once`, `fix-orphan-opportunities`, `kommo-fix-owners`, `viagi-staging-loader`, `meta-lead-ads-recovery-viagi` e `meta-lead-ads-viagi-token-probe`.
**Mudança:** para cada uma, **só se não tiver uso**, publicar um stub que responde 410 com `verify_jwt=true` (o mesmo padrão já aplicado em `meta-lead-ads-backfill-viagi`). O código original fica no histórico do git. No repo, trocar o `index.ts` pelo stub e registrar no doc de auditoria.
**Teste, por função, antes de desativar:**
- Nenhuma referência no código (`src/`, outras functions, migrations).
- Nenhum `cron.job` e nenhuma função do banco chamando a função.
- Nenhuma chamada nos logs das últimas 24h.
- Se qualquer um desses checks achar uso, a função **não** é desativada: ela entra numa lista à parte pra receber autenticação de verdade.
**Teste depois:** chamada sem token → 401; chamada com token → 410.
**Risco:** desativar algo que ainda roda. A mitigação são os checks acima, uma função de cada vez.
**Rollback:** republicar a versão anterior a partir do git.

## 3. Login trava pra usuário com mais de um workspace
**Problema:** `src/pages/auth/SignIn.tsx` busca a org com `.maybeSingle()`. Com 2 orgs ou mais a consulta falha em silêncio, o app não navega e o botão volta pra "Entrar", sem mensagem.
**Mudança:** buscar as orgs do usuário (só `is_active = true`). Com uma, segue o fluxo atual. Com mais de uma, usa a última org usada, se o app já guardar isso, senão a primeira por data de entrada, e segue o mesmo fluxo de onboarding e dashboard. Em caso de erro, mostrar mensagem em vez de travar.
**Teste:**
- Unitário/componente: usuário com 0, 1 e 2 orgs, e com uma org inativa.
- Em produção: criar um usuário de teste com 2 orgs de teste e logar; logar com um usuário de 1 org e conferir que nada mudou.
- `tsc` + `bun run build` (o build pega import quebrado que o tsc não pega).
**Risco:** mudar a org em que o usuário cai. A mitigação é manter a escolha determinística e igual à seleção de org que o app já faz depois do login.
**Rollback:** reverter o PR (só frontend).

## 4. Conferir o sync de Ads da Viagi na conexão nova
**Problema:** desde o PR #118 os crons de Ads da Viagi (05:30 e 06:00 UTC) usam a credencial canônica, porque a flag dela está ligada. Isso ainda não foi observado num ciclo completo.
**Mudança:** nenhuma. É uma checagem.
**Teste:** nos logs de 08/11, procurar `[meta-token] ... org=b246ef6f ... source=canonical result=ok` nas funções `meta-discover-ads-cron` e `marketing-insights-sync-daily`, `orgs_failed = 0`, e linhas novas em `marketing_campaign_insights_daily` da Viagi com data de 07/11.
**Se falhar:** o helper cai na credencial antiga sozinho; se nem isso funcionar, desligar a flag da Viagi (rollback imediato, sem deploy).

## 5. Selo "Conectado" do CAPI sem pixel
**Problema:** em `MetaCapiDialog.tsx`, `isConnected = canonicalActive || orgIntegration.is_enabled`. Com a conexão canônica ativa, o card mostra "Conectado" mesmo sem Pixel ID.
**Mudança:** "Conectado" só quando existe Pixel ID salvo. Sem pixel e com credencial disponível, mostrar "Falta configurar o Pixel" com o botão de configurar.
**Teste:** org sem pixel (estado novo), org com pixel (Auxilius, Viagi e Central em modo legado); `tsc` + build; conferir em pt-BR e en-US.
**Risco:** baixo, só UI.
**Rollback:** reverter o PR.

## 6. Telas que ainda estão em português (en-US)
**Problema:** ficaram fora do PR #117: `IntegrationConnectDialog`, `IntegrationDetailDialog`, `AIProviderConfigDialog`, `KommoMigrationDialog`, `NammuxDialog`, `EvolutionWhatsAppDialog` e `PhoneNumberSettings` (aba Telefonia).
**Mudança:** mesmo padrão do #117 (`uiText` + `uiEnglish`), sem traduzir dados de cliente nem nomes de produto.
**Teste:** teste de cobertura de chaves estendido pra esses arquivos; pt-BR byte a byte igual; `tsc` + build; abrir cada janela em en-US.
**Risco:** baixo. O PR é grande, então pode ser dividido em dois (integrações e telefonia).
**Rollback:** reverter o PR.

## 7. `meta-capi-retry-cron` valida quem chama
**Problema:** a função não valida o chamador. O impacto é baixo (ela só reenvia linhas `failed` já existentes), mas qualquer um pode disparar reenvios.
**Mudança:** usar `resolveCaller` de `_shared/auth/membership.ts` e aceitar só service ou o token interno. O `cron.job` já chama com o token interno.
**Teste:** mapear os chamadores (cron + logs). Depois do deploy: token inválido → 401; chamada no formato do cron → 200; acompanhar a próxima execução do cron (a cada 5 min) nos logs.
**Risco:** bloquear o cron. A mitigação é testar a chamada no formato do cron logo após o deploy.
**Rollback:** republicar a versão anterior.

---

## Depois da aprovação do App Review (fora desta lista)
- Migrar Lead Ads da Viagi e da Central pra credencial canônica, com o teste token salvo × edge `/leads` antes de cada uma.
- Trocar as telas de Ads pras tabelas `meta_*` (`meta-performance-sync`) e desligar o pipeline legado.
- Aposentar a credencial legada quando todas as orgs ativas estiverem migradas e validadas.
