

## Notificação de Nova Versão PWA + Forçar Refresh (com check periódico)

Plano anterior aprovado + sugestão do usuário de polling periódico incorporada.

### Mudanças

**1. `src/components/mobile/PWAUpdatePrompt.tsx`** (novo)

Banner fixo no topo com `useRegisterSW` do `virtual:pwa-register/react`. Inclui polling a cada 30 min:

```tsx
const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, r) {
    r && setInterval(() => r.update(), 30 * 60 * 1000);
  },
});
```

- Banner `bg-primary` fixo no topo com safe-area padding
- "Nova versão disponível!" + botão "Atualizar agora" → `updateServiceWorker(true)`
- Botão X para dispensar temporariamente

**2. `vite.config.ts`** — `registerType: "autoUpdate"` → `"prompt"`

**3. `src/App.tsx`** — Adicionar `<PWAUpdatePrompt />` no nível raiz

### Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/mobile/PWAUpdatePrompt.tsx` | Criar |
| `vite.config.ts` | Editar registerType |
| `src/App.tsx` | Montar componente |

