

# Plano: Redesign completo do layout para tema Seialz

## O que entendi

O tema Seialz nao e apenas troca de cores -- e um redesign completo de layout, tipografia e estrutura visual. O HTML que voce enviou mostra diferenças drasticas:

```text
ATUAL (Base44)                          SEIALZ (HTML template)
─────────────────────────────           ─────────────────────────────
Sidebar fixa 256px                      Sidebar 60px colapsada / 220px expandida
  - Logo grande                           - Logo icone [s] / texto [seialz|]
  - Nav items simples                     - Nav com grupos (PRINCIPAL, COMUNICACAO...)
  - Sem tooltips                          - Tooltips no hover (colapsada)
                                          - Badges de contagem (283, 12, 8)
                                          - Footer com avatar + role
                                          
Topbar inexistente                      Topbar 56px
  - Titulo h1 grande (3xl)               - Titulo 18px + count badge (Share Tech Mono)
  - Controles abaixo                     - Search + view toggle + filtros + CTA na mesma linha

Kanban cards w-80 (320px)               Stages 272px com color bar no header
  - Card branco/shadcn                    - Card bg2, border, hover translateY(-1px)
  - Valor no rodape                       - Valor em verde Share Tech Mono
  - Tags com cor custom                   - Tags 8px mono (HOT, WARM, COLD, AI REC, META)
  - Sem consultor                         - Consultor com colored dot
```

## Estrategia

Como e um redesign de layout (nao so cores), preciso criar **componentes condicionais** ou **variantes** que renderizam diferente quando o tema Seialz esta ativo. Isso e grande demais para uma unica mensagem, entao proponho fazer **por etapas**:

### Etapa 1 (esta mensagem): Layout + Sidebar Seialz
- Criar `SeialzSidebar.tsx` -- sidebar 60/220px com grupos, tooltips, badges, footer com avatar
- Criar `SeialzTopbar.tsx` -- topbar 56px com titulo, count, search, actions
- Modificar `Layout.tsx` para renderizar sidebar/topbar diferente quando `themePreset === 'seialz'`

### Etapa 2 (proxima): Pipeline/Kanban Seialz  
- Criar `SeialzOpportunityCard.tsx` -- card com valor mono verde, tags 8px, consultant dot
- Modificar `OpportunitiesKanban.tsx` -- stages 272px com color bar, topbar integrada
- Stage headers com count badge + valor mono

### Etapas futuras: Outras paginas
- Dashboard, Contatos, Detalhes, etc.

## Arquivos a criar/modificar na Etapa 1

| Arquivo | Acao |
|---------|------|
| `src/components/seialz/SeialzSidebar.tsx` | Criar sidebar colapsavel 60/220px |
| `src/components/seialz/SeialzTopbar.tsx` | Criar topbar 56px |
| `src/components/Layout.tsx` | Condicional: se seialz, usa SeialzSidebar + SeialzTopbar |

## Detalhes tecnicos

### SeialzSidebar
- Estado `collapsed` (default true, toggle no click do logo)
- Nav groups com labels (PRINCIPAL, COMUNICACAO, etc) -- visiveis so quando expandida
- Tooltips posicionados via `getBoundingClientRect` quando colapsada
- Active state: green bar 2px left + green icon + green-dim bg
- Footer: avatar com iniciais + nome + role (Share Tech Mono)
- Badges de contagem nos items (ex: Pipeline 283)

### SeialzTopbar
- Props: `title`, `count?`, `actions?`, `children?`
- Layout: titulo 18px | count badge (mono) | spacer | search | view toggle | filtros | CTA
- Reutilizavel para todas as paginas

### Layout.tsx condicional
```tsx
const { themePreset } = useTheme();

if (themePreset === 'seialz') {
  return (
    <div className="flex h-screen bg-background">
      <SeialzSidebar items={navItems} ... />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
// else: layout atual
```

