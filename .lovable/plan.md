

## Atualizar ícones PWA com a nova imagem

Substituir os ícones PWA atuais pela imagem enviada (`seialz-icon-dark-512.png`).

### Mudanças

1. **Copiar o arquivo** para `public/` em dois tamanhos:
   - `public/pwa-icon-512.png` — imagem original (512x512)
   - `public/pwa-icon-192.png` — mesma imagem (o browser redimensiona, mas idealmente seria 192px; como não temos resize no build, usamos a 512 para ambos — funciona perfeitamente)

2. **Copiar também como `apple-touch-icon`** — o `index.html` já aponta para `/pwa-icon-192.png` no `<link rel="apple-touch-icon">`, então basta substituir o arquivo.

3. **Favicon** — opcionalmente copiar como `public/favicon.png` e atualizar `index.html` para usar PNG ao invés de ICO.

### Arquivos

| Arquivo | Ação |
|---------|------|
| `public/pwa-icon-512.png` | Substituir com novo ícone |
| `public/pwa-icon-192.png` | Substituir com novo ícone |
| `index.html` | Atualizar favicon para PNG (opcional) |

Nenhuma mudança em `vite.config.ts` ou manifest — já referencia os mesmos nomes de arquivo.

