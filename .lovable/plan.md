# Template `distribuicao_com_audiencia` — causa raiz do erro 132018

## O que a Meta devolveu (erro completo)

```text
code: 132018
message: (#132018) There’s an issue with the parameters in your template
```

Mensagem falha: `536fb0b5-4528-453f-90f1-ce19ba535821` (IVET), endpoint
`03bdcb91-b9ec-40b8-a578-f59686a12a86` (Atendimento +55 11 5026-2896,
phone_number_id `1133881223149879`), template `a3e19e2a-…`
(`distribuicao_com_audiencia`, APPROVED, 6 variáveis, BODY apenas).

## Causa raiz (comprovada nos dados)

A variável `{{6}}` (modalidade) chega com **sequências longas de espaços**
usadas como separador visual:

```text
Virtual - Link de acesso: https://teams.microsoft.com/…      |       Posso confirmar sua presença?
```

A Cloud API rejeita parâmetros de texto que contenham nova linha, tabulação
ou mais de 4 espaços consecutivos — exatamente o 132018.

Correlação nas últimas 24 mensagens desse template (7 dias):

| status | error_code | qtd | params com 4+ espaços |
|---|---|---|---|
| read/delivered/sent | — | 22 | 0 |
| failed | 132018 | 4 | 4 |

100% das falhas 132018 têm 4+ espaços consecutivos no parâmetro; 100% dos
envios bem-sucedidos não têm. Não é template rejeitado, não é idioma
(`en` é o idioma cadastrado e funciona), não é janela 24h (o 131008 é outro
caso, separado). O texto colado com o link do Teams + separador `|` é o que
quebra.

## Correção proposta (mínima)

1. **Backend — `supabase/functions/meta-whatsapp-send/index.ts`**
   Sanitizar cada valor de parâmetro antes de montar
   `outboundTemplateComponents` (linha ~752) e antes de renderizar o preview:
   - `\r\n`, `\n`, `\t` → um espaço;
   - runs de 2+ espaços → um único espaço;
   - `trim()` nas pontas.
   Aplicar apenas em parâmetros de template (não altera mensagem livre nem
   o corpo aprovado do template).

2. **Frontend — modal de envio de template**
   (`src/components/whatsapp/templates/SendTemplateModal.tsx` e o caminho do
   Inbox) aplicar a mesma normalização no valor digitado/colado e exibir aviso
   discreto quando houver colapso, para o preview refletir o que a Meta vai
   receber.

3. **UI de erro** — manter como está (já mostra código + mensagem técnica),
   apenas incluir dica específica para 132018: "parâmetro com quebra de linha
   ou muitos espaços".

Nada de banco, RLS, RPC ou reenvio automático. Reenvio dos 4 casos falhos fica
manual, depois do fix.

## Fora de escopo

- Erro `131008` (2 casos) — outra causa, tratar separadamente se você quiser.
- Reescrever o template na Meta (não é necessário).
