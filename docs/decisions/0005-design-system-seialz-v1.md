# ADR 0005 — Design System Seialz v1

**Status:** Aceito.
**Evidência:** `docs/product/design/design-system.md`, `src/index.css`, `tailwind.config.ts`.

## Decisão
- Peso máximo de fonte: 600.
- Tipografia: Outfit (UI), Share Tech Mono (dados).
- Borders: `6px` para elementos, `9999px` para círculos (avatar/dot).
- Cores exclusivamente via tokens semânticos (`bg-muted`, `text-foreground`, etc.). Proibido usar cores diretas do Tailwind (`bg-white`, `text-black`, `bg-[#...]`).
- Todos os tokens em HSL em `src/index.css`.
- Layouts: `AdminLayout` para `/admin/*`, `Layout`/`MobileLayout` para o resto. Sem padding extra dentro do layout.
- Headers de página: apenas `<h1>`, sem subtítulos.

## Consequências
- Consistência entre tema claro/escuro.
- Componentes puramente semânticos.
- Onboarding do desenvolvedor exige leitura obrigatória do design system.
