## Diagnóstico

O usuário NÃO está no preset Seialz — está no kanban legado. Sinais no screenshot: header "Oportunidades" grande (Seialz usaria SeialzTopbar com "Pipeline"), botão "Nova oportunidade" verde grande, busca/filtros em barra separada. Esse caminho usa `OpportunityCard` (não `SeialzOpportunityCard`) e colunas `w-80` (320px).

Minhas edições anteriores foram no caminho Seialz, por isso nada mudou pro usuário.

## Mudanças

### 1. `src/pages/opportunities/OpportunitiesKanban.tsx` linha 1288

- De: `<div key={stage.id} className="flex-shrink-0 w-80">`
- Para: `<div key={stage.id} className="flex-shrink-0 w-[240px]">`

(`w-80` = 320px → 240px = colunas mais finas)

### 2. `src/components/opportunities/OpportunityCard.tsx` linhas 54-55

Aplicar a mesma estrutura que funcionou no Seialz: wrapper `flex-1 min-w-0` e `line-clamp-2` + `title` no `<h4>` (sem `flex-1` direto no h4).

```tsx
<div className="flex justify-between items-start gap-2">
  <div className="flex-1 min-w-0">
    <h4 className="font-medium text-sm text-foreground line-clamp-2 break-words" title={title}>{title}</h4>
  </div>
  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    ...
```

### 3. Manter as edições anteriores (Seialz path)

Já feitas, ficam pra quando o usuário trocar pro tema Seialz.

## Notas

- Sem mudança de lógica.
- Tokens semânticos preservados.
- Não toca mobile.
