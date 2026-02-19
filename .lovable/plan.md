
# Fix: Traduzir erros de validação do backend para português

## Problema

O backend Railway retorna erros de validação em inglês dentro do campo `details[]`:

```json
{
  "error": "Validation failed",
  "details": ["Variables cannot be at the beginning of the message"]
}
```

O `handleResponse` em `src/services/whatsapp.ts` ignora o campo `details` e só exibe a mensagem genérica "Validation failed".

Mesmo que exibisse o `details`, apareceria em inglês para o usuário.

---

## Solução em 2 partes

### Parte 1 — `src/services/whatsapp.ts`

Criar um mapa de tradução dos erros conhecidos do backend, e aplicar na função `handleResponse`:

```typescript
const ERROR_TRANSLATIONS: Record<string, string> = {
  'Variables cannot be at the beginning of the message': 'A mensagem não pode começar com uma variável. Adicione texto antes de {{1}}.',
  'Validation failed': 'Falha na validação do template.',
  'Template name already exists': 'Já existe um template com esse nome.',
  'Invalid template body': 'Corpo do template inválido.',
  'Variables must be sequential': 'As variáveis devem ser sequenciais: {{1}}, {{2}}, etc.',
  'Body is required': 'O corpo da mensagem é obrigatório.',
};

function translateError(msg: string): string {
  return ERROR_TRANSLATIONS[msg] || msg;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Extrai o primeiro detalhe do array details[], se existir
    const detail = Array.isArray(error.details) && error.details.length > 0
      ? error.details[0]
      : null;
    const rawMessage = detail || error.message || error.error || 'Erro na requisição';
    throw new Error(translateError(rawMessage));
  }
  return response.json();
}
```

### Parte 2 — `src/pages/whatsapp/TemplateForm.tsx`

Adicionar validação client-side no Step 2 que detecta se o corpo começa com `{{número}}` e mostra um alerta inline **vermelho** antes de o usuário clicar "Próximo":

```typescript
// Junto às outras validações existentes (linha ~97)
const bodyStartsWithVariable = /^\s*\{\{\d+\}\}/.test(body);

// isStep2Valid deve também checar isso
const isStep2Valid = !bodyError && !bodyStartsWithVariable;
```

No JSX do Step 2, logo abaixo do `<Textarea>`, adicionar o alerta condicional:

```tsx
{bodyStartsWithVariable && (
  <Alert variant="destructive">
    <AlertCircle className="w-4 h-4" />
    <AlertDescription>
      A mensagem não pode começar com uma variável. Adicione texto antes de {'{{1}}'}, por exemplo: <strong>Olá {'{{1}}'}, ...</strong>
    </AlertDescription>
  </Alert>
)}
```

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/services/whatsapp.ts` | Adiciona mapa de tradução de erros + extrai campo `details[]` no `handleResponse` |
| `src/pages/whatsapp/TemplateForm.tsx` | Validação client-side: bloqueia avanço e exibe alerta se o corpo começa com variável |

---

## Resultado esperado

- O toast de erro exibirá em português: **"A mensagem não pode começar com uma variável. Adicione texto antes de {{1}}."**
- No Step 2, antes mesmo de tentar salvar, o usuário verá um aviso vermelho inline com exemplo de como corrigir
- O botão "Próximo" ficará desabilitado enquanto a mensagem começar com variável
