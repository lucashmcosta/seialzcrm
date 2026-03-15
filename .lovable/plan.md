

# Plano: Implementar Seialz Design System v1.0 como tema opcional

## Contexto

O projeto hoje usa o "Base44 Design System" (light mode com Inter, azul elétrico como primary). O novo Seialz DS é um tema dark-first com paleta verde (#00FF88), fontes Outfit + Share Tech Mono, e tokens completamente diferentes.

A estratégia é adicionar o tema Seialz como uma classe CSS (`.theme-seialz`) que sobrescreve todas as CSS variables, mantendo o tema atual como default. Futuramente se torna mandatório.

## Escopo da implementação

### 1. Fontes (index.html + index.css)
- Adicionar Google Fonts: `Outfit:wght@300;400;500;600` e `Share Tech Mono`
- Manter Michroma (já carregada)
- Definir `--font-body`, `--font-mono`, `--font-display` no tema

### 2. CSS Variables — classe `.theme-seialz` (index.css)
Criar bloco `.theme-seialz` que mapeia os tokens do Seialz DS para as CSS vars existentes do shadcn:

```text
.theme-seialz {
  /* Mapeia tokens Seialz → CSS vars shadcn */
  --background:          230 30% 3%      /* #07070A */
  --foreground:          240 3% 94%      /* #F0F0F0 (t1) */
  --card:                240 10% 5%      /* #0C0C10 (bg2) */
  --popover:             240 8% 8%       /* #18181E (bg4) */
  --primary:             153 100% 50%    /* #00FF88 */
  --primary-foreground:  230 30% 3%      /* #07070A */
  --muted:               240 8% 8%       /* bg3 */
  --muted-foreground:    240 4% 62%      /* t2 */
  --border:              240 10% 12%     /* #1A1A22 */
  --destructive:         350 100% 70%    /* #FF4466 */
  --warning:             43 100% 50%     /* #FFB800 */
  --success:             153 100% 50%    /* #00FF88 */
  --sidebar-background:  240 10% 5%      /* bg2 */
  /* + todos os outros tokens */

  /* Seialz-specific custom tokens */
  --sz-green, --sz-bg2..bg5, --sz-t1..tm
  --sz-border, --sz-border2

  /* Font override */
  --font-sans: 'Outfit', sans-serif
  --font-mono: 'Share Tech Mono', monospace

  /* Radius (mais angular) */
  --radius: 0.375rem  /* 6px base */

  /* Shadows (dark-optimized) */
  --shadow-glow: 0 0 20px rgba(0,255,136,0.15)
}
```

### 3. Tailwind config (tailwind.config.ts)
- Adicionar cores utilitárias Seialz: `seialz.green`, `seialz.bg2`, etc.
- Adicionar font families: `font-body` (Outfit), `font-data` (Share Tech Mono), `font-display` (Michroma)
- Adicionar spacing tokens se necessário

### 4. ThemeContext — adicionar `themePreset`
- Nova prop `themePreset: 'default' | 'seialz'`
- Quando `seialz`, aplica `document.documentElement.classList.add('theme-seialz')`
- Sincroniza com organization setting (campo `theme_preset` na tabela)

### 5. ThemeSettings UI — seletor de tema
- Adicionar card no topo das ThemeSettings com toggle/selector entre "Padrão" e "Seialz"
- Preview visual de cada tema

### 6. Docs — atualizar DESIGN_SYSTEM.md
- Adicionar seção sobre o tema Seialz, tokens, e regras de uso

## Arquivos a modificar

| Arquivo | Ação |
|---------|------|
| `index.html` | Adicionar fonts Outfit + Share Tech Mono |
| `src/index.css` | Criar bloco `.theme-seialz` com todos os tokens |
| `tailwind.config.ts` | Adicionar cores seialz, font families |
| `src/contexts/ThemeContext.tsx` | Adicionar `themePreset` state + classe CSS |
| `src/components/settings/ThemeSettings.tsx` | Adicionar seletor de tema |
| `docs/DESIGN_SYSTEM.md` | Documentar tema Seialz |

## Comportamento

- **Default**: Tema atual (Base44, light mode com Inter) — nada muda
- **Seialz ativado**: Classe `.theme-seialz` no `<html>`, sobrescreve todas as vars CSS. A interface inteira muda para dark + verde + Outfit sem precisar alterar nenhum componente individual
- **Persistência**: Salvo no campo `theme_preset` da organization no Supabase

