

## Ajustes na Tela de Login

### Mudanças

1. **Logo maior** — Trocar `w-72` por `w-[420px]` no banner e `w-48` por `w-64` no mobile
2. **Cursor piscando** — Adicionar um `<span>` com animação CSS de blink após a tagline "Do clique ao contrato fechado"

### Arquivos

- **`src/components/auth/AuthLayout.tsx`**:
  - Linha 40: `className="w-72 mb-10"` → `className="w-[420px] mb-12"`
  - Linha 48-49: Adicionar cursor piscando `|` após o texto da tagline com classe `auth-cursor-blink`
  - Linha 82: Logo mobile `w-48` → `w-64`

- **`src/index.css`**: Adicionar animação CSS:
  ```css
  .auth-cursor-blink {
    animation: blink 1s step-end infinite;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  ```

