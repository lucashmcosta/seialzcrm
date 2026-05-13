## Redesign visual do Header da página de oportunidade

Apenas alterações visuais no header. Nenhuma funcionalidade adicionada/removida — apenas reorganização dos elementos já existentes em um card no estilo da imagem 1 (Divus).

**Arquivo:** `src/pages/opportunities/OpportunityDetail.tsx` (linhas ~246–351)

### Estrutura nova do header

1. **Linha superior** (fora do card):
   - À esquerda: botão "Voltar" (mantém atual).
   - À direita: botão "Editar" (verde, mantém atual) + menu de 3 pontinhos (`DotsThreeVertical`) com as ações já existentes (Ligar, Enviar para Assinatura, Marcar como Ganho/Perdido).

2. **Card horizontal** (novo, abaixo da linha superior — `bg-card border rounded-lg p-4`):
   - **Esquerda**: Avatar circular com inicial do contato (cor primária) + bloco vertical:
     - Linha 1: `<nome do contato>` em negrito · `<título da oportunidade>` · Badge do estágio (pill com cor)
     - Linha 2 (texto pequeno, muted): ícone telefone + telefone · ícone email + email do contato (somente se existirem; reusa `opportunity.contacts.phone` / `email`)
   - **Direita**: valor formatado em destaque (`text-xl font-semibold`).

3. Remover a "Linha 2" antiga (título + contact link + stage + valor solto). Mover essas informações para dentro do card.

4. Manter a Badge de status (Aberto/Ganho/Perdido) ao lado do valor dentro do card.

### Detalhes técnicos

- Usar tokens semânticos: `bg-card`, `border`, `text-foreground`, `text-muted-foreground`, `bg-primary/10` para avatar.
- Ícones: `Phone`, `Envelope` do `@phosphor-icons/react` (já em uso no projeto).
- Não alterar handlers, dropdown items, dialogs, tabs ou qualquer lógica abaixo da linha 351.
- Sem mudanças em mobile beyond responsividade natural (flex-wrap).