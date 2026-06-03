## Padronizar botão "Melhorar com IA" no composer do Atendimento

Hoje o composer da tela `/messages` (`MessagesList.tsx`) tem um botão de estrela roxa (Sparkle) dentro do textarea com 4 opções (Corrigir gramática / Tornar profissional / Tornar amigável / Tornar persuasivo). O composer da tela `/inbox` (Atendimento — `InboxComposer.tsx`) não tem esse botão.

### Mudanças em `src/components/inbox/InboxComposer.tsx`

1. Importar `useAI` (`@/hooks/useAI`), `useQuery` (`@tanstack/react-query`) e os ícones `Sparkle`, `TextAa`, `Briefcase`, `Smiley`, `Target`, `SpinnerGap` do `@phosphor-icons/react`.
2. Importar `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (`@/components/ui/dropdown-menu`).
3. Adicionar estado `aiMenuOpen` e `aiImproving`, e `const { generate: generateAI } = useAI()`.
4. Adicionar query `hasAIIntegration` igual à de `MessagesList.tsx` (checa `organization_integrations` com slug `openai-gpt`/`claude-ai`/`lovable-ai` ativo).
5. Adicionar `handleImproveText(mode)` que chama `generateAI({ action: 'improve_text', context: { text, mode } })` e substitui `text` com o resultado.
6. No render do textarea (tanto no modo `compact` quanto no padrão), envolver o `<Textarea>` em um wrapper `relative` e adicionar, à direita, o `DropdownMenu` com o botão Sparkle posicionado absolutamente (mesma estética do `/messages`). Só renderiza quando:
   - `mode === 'reply'` (não em nota interna)
   - `hasAIIntegration === true`
   - `isIn24hWindow` (mesma condição `!outOfWindow` do `/messages`)
   - Botão fica desabilitado quando `!text.trim() || aiImproving`.
7. Pequeno ajuste de `pr-*` no textarea para não sobrepor o ícone.

Sem mudanças em backend, hooks de dados ou lógica de envio — somente UI/comportamento de melhorar texto, idêntico ao da `/messages`.
