# Certificação vinda do Nammux: respostas e ajuste proposto

## Respostas para o Nammux

**1. O evento já é aceito?** Sim. `classification.certified` já está no código do `nammux-webhook-ingest`, com a mesma assinatura e os mesmos headers. Respostas:
- Evento novo e válido: **200** `{ ok, outcome: "confirmed"|"reduced", final: {faixa, comissao}, changed_fields }`.
- `event_id` repetido: **200** `{ ok: true, duplicate: true }`. Nada é gravado de novo.
- Oportunidade já certificada, com outro `event_id`: **409** `already_certified`.
- Outros casos: 404 `opportunity_not_found`, 409 `opportunity_not_won` / `not_classified` / `calibration_not_found`, 422 se a entrada estiver inválida, 400 `interviewer_required`.
- [INCERTO] Não confirmei se a versão publicada é igual à do repositório. Antes do envio real, vale mandar um evento de teste.

**2. O formato bate?** Quase todo:
- `entrada`, `interviewer`, `data.seialz_opportunity_id` e o `event_id` usado como chave de idempotência batem com o código.
- O recálculo usa a versão de calibração da classificação original. Isso também bate.
- A comissão só pode baixar. Se a certificação der um valor igual ou maior, fica valendo o original (`confirmed`).
- **Divergência:** `note` pode ser `null` no envio de vocês, mas aqui a nota é obrigatória. Com nota vazia ou nula, o evento recebe **409** `note_required`.
- **Outro risco:** um evento que falhou fica registrado. Se for reenviado com o mesmo `event_id`, recebe **200** `duplicate`, mas nada é gravado. Por isso um erro pode parecer sucesso no reenvio.

**3. Já chegou alguma certificação?** Não. Há 0 certificações gravadas e 0 eventos de certificação recebidos do Nammux. Os tipos já recebidos são `process.snapshot.updated`, `contact.address.updated`, `contact.updated` e `opportunity.won`.

**4. Reenviar os 26 de uma vez?** Pode, depois do ajuste abaixo. Sugerimos enviar 1 evento primeiro e conferir. Depois, mandar os 25 em sequência, sem paralelismo. Cada certificação gera uma notificação para o vendedor e pode trocar a comissão.

## Ajuste proposto (mínimo, só nesta função)

1. Aceitar `note` nula vinda do Nammux. Quando ela faltar, gravar um texto padrão, por exemplo "Certificado na entrevista por {interviewer}". A regra de nota obrigatória continua valendo na tela do Seialz.
2. Na verificação de evento repetido, considerar só eventos processados. Um evento com erro pode ser reprocessado com o mesmo `event_id`. A certificação continua protegida contra gravação dupla pela chave única de `external_event_id`.
3. Adicionar um teste Deno para esses dois casos e publicar a função.

Nada muda em outros eventos, no banco, no WhatsApp, no Atendimento ou no Comercial.
