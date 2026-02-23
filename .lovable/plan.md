

# Adicionar campos de documentos e endereco ao Contato

## Resumo

Adicionar CPF, RG, nacionalidade e endereco completo na tabela `contacts`, no formulario de criacao/edicao e na tela de detalhe. Atualizar o payload do SuvSign para enviar todos esses campos.

## Mudancas

### 1. Migracao no banco de dados

Adicionar colunas na tabela `contacts`:

| Campo | Exemplo |
|-------|---------|
| cpf | 066.022.648-00 |
| rg | 10760274 |
| rg_issuer | SSP/SP |
| nationality | brasileiro |
| address_street | Rua Albano Fragoso, 309 |
| address_neighborhood | Vila Santa Maria |
| address_city | Sao Paulo |
| address_state | SP |
| address_zip | 02561-010 |

### 2. Formulario de contato (`ContactForm.tsx`)

Adicionar duas novas secoes no formulario:

- **Documentos**: CPF, RG, Orgao Emissor, Nacionalidade
- **Endereco**: Rua/Numero, Bairro, Cidade, Estado, CEP

### 3. Tela de detalhe (`ContactDetail.tsx`)

Exibir os novos campos na aba de detalhes do contato.

### 4. Payload do SuvSign (`SendToSignatureButton.tsx`)

Incluir os novos campos no `custom` do payload para que possam ser mapeados no template da procuracao.

## Secao Tecnica

### SQL

```sql
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS rg_issuer text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text;
```

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| Nova migracao SQL | Adicionar 9 colunas a tabela contacts |
| `src/pages/contacts/ContactForm.tsx` | Secoes de documentos e endereco no formulario |
| `src/pages/contacts/ContactDetail.tsx` | Exibir novos campos nos detalhes |
| `src/components/signature/SendToSignatureButton.tsx` | Enviar novos campos no payload |

