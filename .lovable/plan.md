
# Fix: Edição inline de configurações sem precisar reconfigurar

## Problema identificado

O `IntegrationDetailDialog` exibe os campos como **somente leitura** (texto mascarado em caixas cinzas). Para alterar qualquer campo — incluindo o modelo Claude — a empresa é forçada a clicar em "Reconfigurar", que reseta tudo e exige digitar novamente todas as credenciais do zero.

Isso é especialmente problemático para Claude porque:
1. O campo `default_model` não aparece (não estava salvo no `config_values`)
2. A empresa precisa redigitar a API key inteira para só trocar o modelo

## Solução

Adicionar um **botão "Editar"** no `IntegrationDetailDialog` que transforma os campos em inputs editáveis. Ao salvar, atualiza apenas os `config_values` no banco — sem desconectar, sem perder nada.

O fluxo:
- **Modo visualização** (padrão): campos mascarados como hoje, mais botão "Editar"
- **Modo edição**: campos viram inputs/selects editáveis (usando o `config_schema` da integração)
- **Salvar**: faz `UPDATE` em `organization_integrations.config_values` — sem tocar em `is_enabled` nem `connected_at`
- **Cancelar**: volta ao modo visualização sem salvar

## Mudanças técnicas

### 1. `IntegrationDetailDialog.tsx` — Adicionar modo de edição

**Props novas necessárias:**
- `integrationSchema: any` — o `config_schema` da integração (para renderizar os campos corretamente)

**Estado novo:**
```tsx
const [isEditing, setIsEditing] = useState(false);
const [editValues, setEditValues] = useState<Record<string, any>>({});
const [isSaving, setIsSaving] = useState(false);
```

**Lógica de edição:**
- Ao clicar em "Editar": copiar `configValues` atual para `editValues` (pré-populado com valores existentes, incluindo defaults do schema para campos sem valor)
- Para campos sensíveis (api_key): mostrar input vazio com placeholder "Deixe em branco para manter atual" — ao salvar, se vazio, não sobrescreve o valor existente
- Para campos não-sensíveis (max_tokens, default_model): mostrar com valor atual pré-preenchido

**Renderização em modo edição:**
- Ler campos do `config_schema.fields` e renderizar cada um como input/select (mesmo padrão do `IntegrationConnectDialog`)
- Campo sensível vazio = manter valor atual no save

**Lógica de salvar:**
```tsx
const handleSave = async () => {
  // Montar novo config_values:
  // Para cada campo no schema:
  //   - Se sensível E editValues[key] está vazio → manter configValues[key] (valor atual)
  //   - Caso contrário → usar editValues[key]
  const merged = { ...configValues };
  for (const field of schema.fields) {
    if (isSensitiveField(field.key) && !editValues[field.key]) {
      // mantém valor atual
    } else if (editValues[field.key] !== undefined) {
      merged[field.key] = editValues[field.key];
    }
  }
  
  await supabase
    .from('organization_integrations')
    .update({ config_values: merged })
    .eq('id', orgIntegration.id);
};
```

### 2. `IntegrationsSettings.tsx` — Passar `config_schema` para o dialog

Atualmente o dialog recebe `integration` (que já contém `config_schema`). Precisamos garantir que `IntegrationDetailDialog` acesse `integration.config_schema`.

### 3. Layout do dialog em modo edição

- Substituir o bloco `renderGenericConfig()` (campos read-only) por campos editáveis quando `isEditing === true`
- Botões no footer mudam de `[Reconfigurar] [Desconectar]` para `[Salvar] [Cancelar]` (quando editando)
- Quando não está editando: adicionar botão "Editar" ao lado de "Reconfigurar"

### Layout proposto do footer:

**Modo visualização:**
```
[Editar]  [Reconfigurar]  [Desconectar]
```

**Modo edição:**
```
[Cancelar]  [Salvar]
```

## Comportamento especial para campos sensíveis

Campos como `api_key`, `auth_token`, `password`:
- Input de texto com `type="password"`
- Placeholder: `"Deixe em branco para manter a chave atual"`
- Se enviado vazio: **mantém o valor salvo no banco** (não sobrescreve)
- Se preenchido: substitui pelo novo valor

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/components/settings/IntegrationDetailDialog.tsx` | Adicionar modo edição com campos do schema |

Nenhuma mudança no banco de dados necessária. O `config_schema` já existe na integração (campo `integration` passado via props).
