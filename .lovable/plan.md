

## Plano: Exportar conversas de clientes que fecharam (Viagi) para análise com IA

### O que será feito

Criar um botão de **exportação** na página de Mensagens que gera um arquivo de texto estruturado com todas as conversas de contatos que têm oportunidades ganhas (won). O arquivo será formatado para facilitar a análise por IA (ChatGPT, Claude, etc.).

### Formato do arquivo exportado

```text
=== CONTATO: Gilmar Salino | Tel: +5577998003145 ===
Oportunidade: Voo Atrasado - Gilmar Salino | Valor: R$ 0,00

[2026-02-10 14:30] [Agente - Allan Tavares]: Olá Gilmar, tudo bem?...
[2026-02-10 14:35] [Cliente]: Boa tarde, tudo sim...
[2026-02-10 14:40] [Agente IA]: Obrigado pela resposta...
---

=== CONTATO: Jose Cristiano | Tel: +5531998959888 ===
...
```

### Implementação técnica

1. **Nova Edge Function `export-conversations`**: Recebe `organization_id` e filtros (ex: `opportunity_status=won`), busca contatos + oportunidades + threads + mensagens via Supabase service role, monta o texto formatado e retorna como download.

2. **Botão na UI**: Adicionar um botão "Exportar conversas" na página de Mensagens (ou na lista de contatos) que chama a edge function e dispara o download do arquivo `.txt`.

3. **Filtros disponíveis**:
   - Organização (automático pelo contexto do usuário)
   - Status da oportunidade (won, lost, open)
   - Período de datas

### Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/export-conversations/index.ts` | Criar - Edge function que monta o export |
| `src/pages/messages/MessagesList.tsx` | Editar - Adicionar botão de exportação |
| `supabase/config.toml` | Editar - Registrar nova function |

