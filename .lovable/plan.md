

# Plano: Adicionar Coluna `metadata` na Tabela `messages`

## Diagnóstico

O log do Railway mostra claramente o erro:

```text
❌ Error saving outbound message: {
  code: 'PGRST204',
  message: "Could not find the 'metadata' column of 'messages' in the schema cache"
}
```

**Fluxo atual:**
1. Cliente envia mensagem "bora fechar esse visto?"
2. Railway processa e gera resposta da IA
3. Twilio envia com sucesso (SM247209c16822779c027d0248e2a18b8a)
4. Railway tenta salvar no banco com coluna `metadata`
5. Banco rejeita porque coluna não existe
6. UI mostra "Unknown error"

**Nota importante:** A mensagem FOI enviada para o WhatsApp do cliente! O erro acontece apenas ao salvar no banco de dados local.

---

## Solução

Adicionar a coluna `metadata` (tipo JSONB) na tabela `messages` para compatibilidade com o Railway backend.

---

## Migration SQL

```sql
-- Adicionar coluna metadata para compatibilidade com Railway backend
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Índice GIN para busca eficiente dentro do JSON (opcional mas recomendado)
CREATE INDEX IF NOT EXISTS idx_messages_metadata 
ON messages USING GIN (metadata) 
WHERE metadata IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN messages.metadata IS 'Metadados adicionais da mensagem (ex: tool_calls, tokens_used, model)';
```

---

## O que a coluna `metadata` guarda

Baseado no comportamento típico de integrações com IA:

```json
{
  "model": "gpt-4o",
  "tokens_used": 450,
  "tool_calls": ["mark_name_asked"],
  "processing_time_ms": 3500,
  "twilio_sid": "SM247209c16822779c027d0248e2a18b8a"
}
```

---

## Resumo Visual

```text
┌─────────────────────────────────────────────────────────────┐
│                    PROBLEMA ATUAL                           │
├─────────────────────────────────────────────────────────────┤
│ Railway tenta: INSERT INTO messages (... metadata ...)      │
│ Banco responde: "coluna 'metadata' não existe"              │
│ Resultado: Erro + mensagem não salva no CRM                 │
└─────────────────────────────────────────────────────────────┘

                              ↓

┌─────────────────────────────────────────────────────────────┐
│                    SOLUÇÃO                                  │
├─────────────────────────────────────────────────────────────┤
│ Criar coluna: ALTER TABLE messages ADD COLUMN metadata JSONB│
│ Resultado: Railway salva normalmente + mensagem aparece     │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| Nova migration SQL | Adiciona coluna `metadata` JSONB na tabela `messages` |

---

## Impacto

- Nenhuma alteração no código frontend necessária
- Railway continuará funcionando normalmente
- Mensagens passarão a ser salvas corretamente
- UI mostrará as mensagens em vez de "Unknown error"

---

## Seção Técnica

A migration adiciona:

1. **Coluna `metadata`**: Tipo JSONB, nullable, default NULL
2. **Índice GIN**: Para busca eficiente dentro do JSON (útil se precisar filtrar por tool_calls ou model no futuro)
3. **Comentário**: Documenta o propósito da coluna

