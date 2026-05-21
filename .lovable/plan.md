## Mudança

No card de "Possível Duplicata Detectada" em `src/pages/contacts/ContactForm.tsx`:

- **Quando a duplicidade for por telefone** (bloqueia obrigatoriamente pelo índice único do banco): trocar o botão "Salvar mesmo assim" por **"Abrir contato existente"**, que navega para `/contacts/{id}` do contato encontrado. Manter "Cancelar".
- **Quando for duplicidade só por email** e a organização **não** estiver com `duplicate_enforce_block`: manter o comportamento atual com "Salvar mesmo assim" (a regra de email é configurável e o banco permite).
- Se houver mais de um duplicado, cada card mostra seu próprio botão "Abrir contato".

Sem mudanças em backend/banco. Apenas ajuste de UI/UX do bloco de duplicidade.

### Arquivo
- `src/pages/contacts/ContactForm.tsx`
