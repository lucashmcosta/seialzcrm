## Ajuste 1 — Credenciais simplificadas (só System User Token obrigatório)

### Backend

**`supabase/functions/meta-lead-ads-connect/index.ts`**
- Validação: exigir só `organization_id` e `system_user_token`. `app_id`/`app_secret` opcionais.
- Validar token chamando `metaGraphGet("/me", ...)` passando `appSecret: app_secret || undefined`.
- Encriptar secret só se vier: `enc_secret = app_secret ? await encryptSecret(app_secret) : null`.
- `connected_account.app_id = app_id || null`, `app_secret_encrypted = enc_secret`.

**`supabase/functions/_shared/meta-graph.ts`**
- Em `metaGraphGet`, só adicionar `appsecret_proof` quando `opts.appSecret` for truthy (string não vazia). Já é o caso (`if (opts.appSecret)`), mas reforçar com `if (opts.appSecret && opts.appSecret.length > 0)` para evitar string vazia gerar proof inválido.

**`meta-lead-ads-discover` / `poll` / `process-lead` / `token-health`**
- Auditar: substituir
  ```ts
  const appSecret = await decryptSecret(ca.app_secret_encrypted);
  ```
  por
  ```ts
  const appSecret = ca.app_secret_encrypted
    ? await decryptSecret(ca.app_secret_encrypted)
    : undefined;
  ```
- Em todas as chamadas `metaGraphGet(..., { accessToken, appSecret })`, manter como está — `appSecret` será `undefined` quando não houver, e o helper passa a ignorar.

### Banco (migration)

Atualizar `admin_integrations.config_schema` para `slug = 'meta-lead-ads'`:
```json
{
  "fields": [
    {"key":"system_user_token","label":"System User Token","type":"password","required":true,
     "help":"Token gerado em Business Manager → System Users → Generate Token"},
    {"key":"business_id","label":"Business ID (opcional)","type":"text","required":false},
    {"key":"app_id","label":"App ID (avançado)","type":"text","required":false,
     "help":"Só preencha se o app exigir appsecret_proof"},
    {"key":"app_secret","label":"App Secret (avançado)","type":"password","required":false}
  ]
}
```

### Frontend — `ConnectionForm.tsx`
- Apenas `system_user_token` obrigatório.
- Renderizar campos `business_id` no topo, e agrupar `app_id` + `app_secret` numa seção "Avançado (opcional)" colapsável (usar `<Collapsible>` do Radix), fechada por padrão.
- Texto: "Para a maioria dos casos, basta o System User Token. App ID e Secret só são necessários se o seu app do Meta exigir appsecret_proof."
- Ao chamar `meta-lead-ads-connect`, enviar `app_id`/`app_secret` apenas se preenchidos.

---

## Ajuste 2 — UX: Dialog largo no lugar de página dedicada

### Criar `src/components/integrations/meta-lead-ads/MetaLeadAdsDialog.tsx`
- Props: `{ open, onOpenChange, integration, orgIntegration }`.
- `<Dialog>` com `<DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">`.
- Header: nome + status badge (Conectado/Desconectado/Token expirando).
- Tabs internas (componente `Tabs` do `@/components/ui/tabs`):
  1. **Conexão** → `<ConnectionForm existing={orgIntegration} onSuccess={refetch} />`
  2. **Formulários e Mapeamento** → `<PagesAndFormsList orgIntegrationId={orgIntegration.id} />` (clicar "Mapear" abre `MappingDrawer` por cima — Sheet aninhado é OK).
  3. **Configurações** → `<SettingsCard orgIntegration={orgIntegration} />`
  4. **Status** → `<StatusDashboard orgIntegrationId={orgIntegration.id} />`
- Se ainda não conectado, abrir já na aba "Conexão" e desabilitar visualmente as outras (com tooltip "Conecte primeiro").

### `IntegrationsSettings.tsx`
- Remover os 2 early-returns que fazem `navigate('/integrations/meta-lead-ads')` (linhas 448 e 463) — tratar como qualquer outra integração.
- Adicionar render condicional no final do JSX:
  ```tsx
  {selectedIntegration?.slug === 'meta-lead-ads' && (
    <MetaLeadAdsDialog
      open={detailDialogOpen || connectDialogOpen}
      onOpenChange={(o) => { setDetailDialogOpen(o); setConnectDialogOpen(o); }}
      integration={selectedIntegration}
      orgIntegration={selectedOrgIntegration}
    />
  )}
  ```
- Os componentes `IntegrationConnectDialog` e `IntegrationDetailDialog` genéricos só renderizam quando `slug !== 'meta-lead-ads'` — adicionar guards.

### Remoções
- Apagar `src/pages/integrations/MetaLeadAdsPage.tsx`.
- Em `src/App.tsx`: remover import de `MetaLeadAdsPage` e a `<Route path="/integrations/meta-lead-ads" ...>` (linhas 355–362).

---

## Ordem de execução
1. Migration para `admin_integrations.config_schema`.
2. Edge functions: `connect`, `meta-graph` helper, depois `discover`/`poll`/`process-lead`/`token-health` (decryptSecret condicional). Deploy as 5.
3. Frontend: criar `MetaLeadAdsDialog`, atualizar `ConnectionForm` (collapsible + opcionalidade), refatorar `IntegrationsSettings`, remover rota e página.

Sem novos secrets. Sem novas tabelas. Após aplicar, pronto pra revisão final.