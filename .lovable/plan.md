

## Esconder Bottom Tab Bar na View de Chat

### Abordagem
Adicionar uma prop `hideBottomBar` ao `MobileLayout`. Quando `true`, a bottom tab bar não renderiza e o conteúdo ocupa o espaço todo. O `MobileMessagesList` passa essa prop quando o usuário está na View 2 (chat aberto).

### Mudanças

1. **`src/components/mobile/MobileLayout.tsx`**
   - Adicionar prop `hideBottomBar?: boolean` na interface `MobileLayoutProps`
   - Envolver a `<nav>` do bottom bar com `{!hideBottomBar && (...)}`

2. **`src/components/mobile/MobileMessagesList.tsx`** (novo componente, parte do plano de mensagens)
   - Quando um chat está selecionado (View 2), renderizar `<MobileLayout hideBottomBar>`
   - Quando na lista (View 1), renderizar `<MobileLayout>` normal

Isso dá mais espaço vertical para o chat e evita distração visual durante a conversa.

