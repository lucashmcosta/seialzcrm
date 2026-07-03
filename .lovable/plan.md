
# Varredura pré-PR2.6 — 4 cenários

Cutoff usado: `2026-06-16 22:29:40+00`. "Endpoints CS" = `purpose='customer_service'`. "Endpoints comerciais" = `purpose IN ('commercial','vendor_personal')`.

## Resumo

| # | Cenário | Threads | Msgs | Recomendação |
|---|---|---:|---:|---|
| 1 | `sales` + primary CS + atividade pós-cutoff no primary | **308** | 3 856 | **Corrigir → PR2.6** |
| 2 | `customer_service` + primary é `commercial`/`vendor_personal` | **0** | — | Ignorar (nada a fazer) |
| 3 | `sales` + msg pós-cutoff em endpoint CS **≠ primary** | **85** | 222 | **Investigar manualmente — NÃO auto-corrigir** |
| 4 | `customer_service` + msg pós-cutoff em endpoint comercial | **0** | 0 | Ignorar (nada a fazer) |

## Cenário 1 — 308 threads

Re-confirmado. Interseção 1-para-1 (nenhum falso positivo). Igual à auditoria anterior. Elegível para PR2.6.

## Cenário 2 — 0 threads

Nenhum caso. As threads marcadas `customer_service` nunca têm primary comercial. A regra do PR2 não gerou inversão indevida.

## Cenário 3 — 85 threads (todas fora do cenário 1)

Padrão observado nos 10 exemplos: primary é **+551150287020 (commercial, Meta)** ou **+551150287067 (commercial, Twilio)**, mas o mesmo contato também trocou mensagens em **+551150287027** ou **+16893077491** (ambos CS). Essas mensagens agregaram na thread comercial existente (mesmo contact_id).

Exemplos:
- `𝓡𝓲𝓬𝓪𝓻𝓭𝓸 𝓐𝓵𝓮𝔁𝓪𝓷𝓭𝓻𝓮` (primary 7020) → 18 msgs no 7027 até 29/06.
- `Cheila` (primary 7020) → 3 msgs no 7027.
- `MICHAEL FRANCIS DE LIMA` (primary 7067) → 3 msgs no 7027.
- `Joao Teste` (primary 7020) → 9 msgs no +16893077491.

Isso **não é bug do backfill** — o primary é legitimamente comercial e a UI /messages está correta. É contato multi-canal.

Auto-corrigir moveria conversas comerciais para /inbox por causa de ruído lateral. **Deixar como está.** Se quiser, é candidato a um relatório separado no futuro (ex.: "conversas comerciais com paralelo no atendimento").

Overlap com cenário 1: **0**. Não há dupla-contagem.

## Cenário 4 — 0 threads

Nenhuma thread `customer_service` recebeu mensagem em endpoint comercial após o cutoff. O inverso não acontece.

## Conclusão

O universo real a corrigir é **exatamente 308 threads** (Cenário 1). Cenários 2 e 4 são vazios. Cenário 3 (85) é semanticamente distinto e não deve ser tocado pelo PR2.6.

Pronto para aprovar PR2.6 conforme já especificado:

- backfill em `message_threads_business_context_backfill_20260703`
- UPDATE nas 308 (abortar se ≠ 308)
- rollback via UPDATE reverso a partir da tabela de backfill
- efeito esperado nas RPCs: /messages 11 657 → 11 349; /inbox 1 056 → 1 364; total preservado

Aguardando aprovação para executar o PR2.6.
