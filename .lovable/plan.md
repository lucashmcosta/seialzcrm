## Problema

Card de duplicidade (com nome do contato + botão "Abrir contato") existe em `ContactForm.tsx` mas não aparece quando o contato salvo está sem o 9º dígito (ex: Mazanni `+559186317150`) e o usuário digita com 9 (`91986317150`). Front compara `phone` cru; DB valida via `phone_normalized`. Resultado: só toast, sem card.

## Mudança única

`src/pages/contacts/ContactForm.tsx`:

1. Adicionar helper local `normalizePhoneBR(phone)` que porta a lógica de `public.normalize_phone_br` do banco (extrai dígitos, aplica 55, adiciona 9º dígito em móvel de 10 dígitos).
2. Em `checkPhoneUniqueness()`: trocar `.eq('phone', formData.phone)` por `.eq('phone_normalized', normalizePhoneBR(formData.phone))`.
3. Em `checkDuplicates()`: nas condições de `phone` e `email_or_phone`, usar `phone_normalized` normalizado em vez de `phone` cru.
4. `handleDbError` não precisa mudar — já chama `checkPhoneUniqueness()`, que agora acha o duplicado.

Nenhuma mudança visual, nenhuma outra alteração de arquivo, nada no banco.

## Validação

1. Cadastrar `91986317150` em Central Trabalhista → card com "Mazanni Cordeiro" + botão "Abrir contato" aparece.
2. Botão navega para `/contacts/f8242363-...`.
3. Número inédito salva normal.
4. Editar Mazanni sem trocar telefone → salva (auto-exclusão por id).
5. Email duplicado continua funcionando.
