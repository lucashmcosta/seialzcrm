

# Redesign da Pagina de Configuracoes - Cards + Rotas (Final)

## Resumo

Substituir o layout de tabs horizontais por um grid de cards agrupados por categoria, usando rotas reais do React Router. Icones usam cores do tema da empresa via tokens semanticos.

## Arquivos a Criar (3)

### 1. `src/components/settings/SettingsCard.tsx`
Componente visual do card:
- Props: `icon` (LucideIcon), `label`, `description`, `badge?`, `badgeVariant?`, `to` (rota relativa)
- Usa `<Link to={to}>` do React Router
- Cores semanticas: `bg-primary/10 text-primary`, hover com `hover:border-primary/15 hover:bg-primary/5`
- Seta chevron a direita

### 2. `src/components/settings/SettingsGrid.tsx`
Tela principal (index):
- Barra de busca filtrando por label e descricao
- Cards agrupados em 5 categorias
- Filtragem por permissoes e feature flags
- Grid responsivo: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Estado vazio para busca sem resultados

### 3. `src/components/settings/SettingsLayout.tsx`
Layout wrapper:
- `<Layout>` como wrapper externo
- Redirect de `?tab=xxx` para `/settings/xxx` (retrocompatibilidade)
- **Breadcrumb** quando em rota filha: "Configuracoes > Label do Card" usando o componente `Breadcrumbs` existente de `src/components/application/breadcrumbs/breadcrumbs.tsx`. O label e obtido a partir do path atual cruzando com a lista de cards definida no SettingsGrid.
- `<Outlet />` para conteudo

Mapeamento de tab IDs antigos para rotas:
```text
whatsappTemplates  -> whatsapp-templates
permissionProfiles -> permissions
customFields       -> custom-fields
aiAgent            -> ai-agent
knowledgeBase      -> knowledge-base
knowledgeEdit      -> edit-kb
apiWebhooks        -> api-webhooks
auditLogs          -> audit-logs
general, theme, users, billing, pipeline, duplicates,
tags, integrations, products, trash -> mesma slug
```

## Arquivos a Modificar (4)

### 4. `src/App.tsx`
Substituir rota unica `/settings` por rotas aninhadas:
```text
<Route path="/settings" element={<SettingsLayout />}>
  <Route index element={<SettingsGrid />} />
  <Route path="general" element={<GeneralSettings />} />
  <Route path="theme" element={<ThemeSettings />} />
  <Route path="custom-fields" element={<CustomFieldsSettings />} />
  <Route path="tags" element={<TagsSettings />} />
  <Route path="pipeline" element={<PipelineSettings />} />
  <Route path="users" element={<UsersSettings />} />
  <Route path="permissions" element={<PermissionProfilesSettings />} />
  <Route path="duplicates" element={<DuplicatePreventionSettings />} />
  <Route path="integrations" element={<IntegrationsSettings />} />
  <Route path="whatsapp-templates" element={<WhatsAppTemplates />} />
  <Route path="ai-agent" element={<AIAgentSettings />} />
  <Route path="api-webhooks" element={<ApiWebhooksSettings />} />
  <Route path="billing" element={<BillingSettings />} />
  <Route path="products" element={<ProductsSettings />} />
  <Route path="knowledge-base" element={<KnowledgeBaseSettings />} />
  <Route path="edit-kb" element={<KnowledgeEditChat />} />
  <Route path="audit-logs" element={<AuditLogs />} />
  <Route path="trash" element={<Trash />} />
  <Route path="*" element={<Navigate to="/settings" replace />} />
</Route>
```

### 5. `src/pages/whatsapp/TemplatesList.tsx`
Atualizar 1 referencia:
- `"/settings?tab=whatsappTemplates"` -> `"/settings/whatsapp-templates"`

### 6. `src/pages/whatsapp/TemplateForm.tsx`
Atualizar 2 referencias:
- Linha 165: `navigate('/settings?tab=whatsappTemplates')` -> `navigate('/settings/whatsapp-templates')`
- Linha 188: `navigate('/settings?tab=whatsappTemplates')` -> `navigate('/settings/whatsapp-templates')`

### 7. `src/pages/whatsapp/TemplateDetail.tsx`
Atualizar 4 referencias:
- Linha 71: `navigate('/settings?tab=whatsappTemplates')` -> `navigate('/settings/whatsapp-templates')`
- Linha 154: `navigate('/settings?tab=whatsappTemplates')` -> `navigate('/settings/whatsapp-templates')`
- Linha 172: `navigate('/settings?tab=whatsappTemplates')` -> `navigate('/settings/whatsapp-templates')`
- (E qualquer outra ocorrencia no arquivo)

## Arquivo a Deletar (1)

### 8. `src/pages/Settings.tsx`
Substituido por SettingsLayout + SettingsGrid. Toda logica de permissoes e flags migra.

## Mapeamento Completo: Card -> Componente -> Rota

| Card | Componente | Rota | Permissao | Flag |
|------|-----------|------|-----------|------|
| Geral | GeneralSettings | /settings/general | - | - |
| Tema e Cores | ThemeSettings | /settings/theme | canManageSettings | - |
| Campos Personalizados | CustomFieldsSettings | /settings/custom-fields | canManageSettings | - |
| Etiquetas | TagsSettings | /settings/tags | canManageSettings | - |
| Pipeline | PipelineSettings | /settings/pipeline | canManageSettings | - |
| Usuarios | UsersSettings | /settings/users | canManageUsers | - |
| Perfis de Permissao | PermissionProfilesSettings | /settings/permissions | canManageSettings | - |
| Duplicatas | DuplicatePreventionSettings | /settings/duplicates | canManageSettings | - |
| Integracoes | IntegrationsSettings | /settings/integrations | canManageIntegrations | - |
| WhatsApp Templates | WhatsAppTemplates | /settings/whatsapp-templates | canManageIntegrations | hasWhatsApp |
| Agente IA | AIAgentSettings | /settings/ai-agent | canManageIntegrations | showAIFeatures |
| API e Webhooks | ApiWebhooksSettings | /settings/api-webhooks | canManageIntegrations | - |
| Faturamento | BillingSettings | /settings/billing | canManageBilling | - |
| Produtos | ProductsSettings | /settings/products | canManageIntegrations | showAIFeatures |
| Base de Conhecimento | KnowledgeBaseSettings | /settings/knowledge-base | canManageIntegrations | showAIFeatures |
| Editar KB | KnowledgeEditChat | /settings/edit-kb | canManageIntegrations | showAIFeatures |
| Historico | AuditLogs | /settings/audit-logs | canManageSettings | - |
| Lixeira | Trash | /settings/trash | canManageSettings | - |

## Breadcrumb

Quando o usuario esta numa rota filha (ex: `/settings/users`), o SettingsLayout renderiza o `Breadcrumbs` component existente:

```text
Home > Configuracoes > Usuarios & Permissoes
```

O label e obtido cruzando o pathname atual com a definicao dos cards (exportada do SettingsGrid ou de um arquivo de configuracao compartilhado).

## Catch-all

Rota `<Route path="*" element={<Navigate to="/settings" replace />} />` dentro das rotas aninhadas garante que URLs invalidas como `/settings/xyz` redirecionam para o grid.

## Protecao de Rotas por Flag

No SettingsLayout, verificar se a rota atual requer feature flag. Se nao ativa, redirecionar para `/settings`.

## Resultado do Grep: Arquivos com Referencias a `?tab=`

Apenas **3 arquivos** no projeto inteiro:
1. `src/pages/whatsapp/TemplatesList.tsx` - 1 referencia
2. `src/pages/whatsapp/TemplateForm.tsx` - 2 referencias
3. `src/pages/whatsapp/TemplateDetail.tsx` - 4 referencias

Nenhum outro arquivo usa `?tab=` ou `/settings?`. Todos serao atualizados.

## O que NAO muda

- Nenhum componente interno de configuracao
- Layout wrapper principal (`<Layout>`)
- Logica de permissoes (apenas reposicionada)
- Banco de dados ou APIs
- Nenhuma dependencia nova

