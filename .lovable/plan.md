# Modal SuvSign V2 — Proposta A (lista + detalhe)

Somente a tela do "Enviar contrato V2 (Piloto)". O botão e o fluxo V1, o backend, o snapshot, o multidocumento, o webhook, o Nammux, as flags e as credenciais não mudam. Sem migration e sem envio real.

## Achado da auditoria: "Copiar link" (item 10)
- Hoje o `send_for_signature` recebe a resposta da SuvSign e só grava status, datas e ids do participante (`syncFromOperation`). Os `signing_links[]` são descartados.
- A tabela `signature_request_participants` não tem coluna para o link, e a UI não recebe nenhum link.
- [INCERTO] Não há documentação sobre um endpoint da SuvSign que devolva o link depois do envio.
- Conforme a especificação, **paro aqui e não crio backend nesta rodada**. O botão "Copiar link" não entra (não invento URL nem token).
- Menor alteração possível, para uma próxima aprovação:
  - (a) se a SuvSign tiver um GET com o link do participante, criar a ação `get_signing_link` na edge, que busca o link na hora sem gravar;
  - (b) se não tiver, guardar o link cifrado por participante, o que exige migration.
- Preciso da confirmação da SuvSign antes de escolher.

## O que muda
Arquivo: `src/components/signature/SignatureV2Sheet.tsx`, com o mesmo nome e as mesmas props. Se ficar grande, divido em subcomponentes na mesma pasta.

- **Modal:** `Dialog` atual, `max-w-[1120px]`, `max-h-[90dvh]`. O título e o subtítulo continuam os de hoje, e o corpo tem scroll interno.
- **Tela principal (desktop):** coluna esquerda estreita com "+ Novo envio" e uma lista compacta. Cada item mostra os documentos resumidos, o participante principal, "N documentos", o status e a data mais relevante. A área direita mostra o detalhe do item selecionado, que começa no primeiro.
- **Detalhe:** status geral e datas reais no topo. Depois vêm os participantes (nome, e-mail, status, aberto em, assinado em) e os documentos (um por linha, com status e "Baixar" quando concluído).
  - Atualizar e Cancelar ficam discretos. Cancelar só aparece nos estados que a API aceita.
  - A tela de concluído mostra ✓ nos participantes e nos documentos. Não mostra hashes, IDs nem verification_code.
- **Rascunho:** mostra os documentos e o participante, com "Continuar preparação", que abre a prévia já salva.
  - "Descartar rascunho" usa o `cancel_signature` que já existe. Ele funciona para rascunho sem operação na SuvSign.
- **A1 Escolher documentos:** checkboxes vindos de `list_templates`, com os incompatíveis desabilitados e o motivo. O rodapé mostra "N documentos selecionados" e o botão "Continuar".
- **A2 Dados e signatários (novo passo visual):**
  - roda o `prepare_contract` atual;
  - mostra, só para leitura, "Dados preenchidos pelo CRM" a partir de `snapshot.variables`, agrupados em Cliente, Endereço e Oportunidade quando as chaves existirem;
  - mostra os signatários do snapshot com "Assina N documentos".
  - Pendências: os erros reais 422 (`missing_contact_fields`, `unresolved_template_variables`) aparecem como área de atenção com a lista e o botão "Abrir contato", em vez de toast.
  - O papel extra não resolvido continua com os campos de nome e e-mail de hoje.
- **A3 Prévia:** lista de documentos à esquerda com o ativo destacado e a prévia grande à direita (no mobile, um seletor acima). Mostra a contagem de documentos e os participantes. O botão diz "Enviar N documento(s) para assinatura", no singular ou plural. Nada é recalculado.
- **Solicitações antigas de 1 documento:** o `snapshot.documents` é opcional, e o fallback usa `template_name`/`provider_documents`.
- **Mobile:** lista → toque → detalhe em tela cheia com "Voltar". As etapas usam a largura toda.
- Componentes existentes: Dialog, Button, Badge, Checkbox, ScrollArea, Tabs e tokens semânticos (peso máximo 600, raio de 6px).

## Verificação
- Build e typecheck.
- Abrir o modal pelo preview, se o login e o piloto permitirem, e tirar prints da lista, do detalhe, do A1, do A2 e do A3.
- Não crio operação real.

## Resultado esperado
Todos os itens da especificação entregues, menos o 10, que fica BLOQUEADO até a confirmação da SuvSign.
