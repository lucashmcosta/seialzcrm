# Sistema de Ícones · Phosphor Icons

> Biblioteca oficial de ícones do Seialz. Todos os ícones usam [Phosphor Icons](https://phosphoricons.com).

---

## 01 · Peso Padrão

| Peso     | Uso                  |
| -------- | -------------------- |
| `thin`   | Decorativo           |
| **`light`** | **Padrão UI** ✓   |
| `regular`| Alternativo          |
| **`bold`**  | **Ênfase / CTA** ✓ |
| `fill`   | Estado ativo         |
| `duotone`| Ilustrações          |

**Regra:** usar `light` como padrão. `bold` para ênfase/CTA. `fill` para estados ativos (ex: nav selecionada).

---

## 02 · Ícones do Produto

Mapeamento módulo → ícone Phosphor:

| Módulo           | Ícone Phosphor       |
| ---------------- | -------------------- |
| Dashboard        | `ChartLineUp`        |
| Pipeline         | `Funnel`             |
| Leads / Contatos | `UsersThree`         |
| Power Dialer     | `PhoneCall`          |
| WhatsApp         | `WhatsappLogo`       |
| SMS              | `ChatCircleText`     |
| Email            | `EnvelopeSimple`     |
| AI Coach         | `Robot`              |
| Campanhas        | `Target`             |
| Receita          | `CurrencyDollar`     |
| Attribution      | `ArrowsLeftRight`    |
| Configurações    | `GearSix`            |
| Integrações      | `Plug`               |
| Marketing        | `MegaphoneSimple`    |
| Agenda           | `CalendarBlank`      |
| Tarefas          | `ClipboardText`      |

---

## 03 · Ações

| Ação             | Ícone Phosphor         |
| ---------------- | ---------------------- |
| Adicionar        | `Plus`                 |
| Editar           | `PencilSimple`         |
| Excluir          | `TrashSimple`          |
| Buscar           | `MagnifyingGlass`      |
| Filtrar          | `FunnelSimple`         |
| Abrir / Expandir | `ArrowSquareOut`       |
| Download         | `DownloadSimple`       |
| Copiar           | `Copy`                 |
| Compartilhar     | `ShareNetwork`         |
| Atualizar        | `ArrowsClockwise`      |
| Fechar           | `X`                    |
| Menu / Mais      | `DotsThreeVertical`    |

---

## 04 · Status

Ícones de status com cores do sistema:

| Status   | Ícone           | Cor           |
| -------- | --------------- | ------------- |
| Sucesso  | `CheckCircle`   | `#00FF88`     |
| Atenção  | `WarningCircle` | `#FFB800`     |
| Erro     | `XCircle`       | `#FF4466`     |
| Info     | `Info`          | `#4488FF`     |

---

## 05 · Cores por Fundo

| Contexto         | Cor         |
| ---------------- | ----------- |
| Ícone em fundo escuro  | `#00FF88` (neon green) |
| Ícone em fundo claro   | `#00884A`              |
| Ícone em fundo verde   | `#003D1E`              |
| Ícone muted/inativo    | `#5A5A66`              |

---

## 06 · Tamanhos

| Tamanho | Uso                              |
| ------- | -------------------------------- |
| `16`    | Inline text, badges, tags        |
| `20`    | Botões, inputs, sidebar nav      |
| `24`    | Padrão UI, cards, headers        |
| `32`    | Feature cards, empty states      |
| `48`    | Hero sections, landing page      |

---

## 07 · Exemplos de Uso

### Navegação

```tsx
// Nav item (não selecionado)
<PhoneCall size={20} weight="light" />

// Nav item (hover/ênfase)
<PhoneCall size={20} weight="bold" />

// Nav item (selecionado/ativo)
<PhoneCall size={20} weight="fill" />
```

### Importação

```tsx
import { PhoneCall, ChartLineUp, Robot } from "@phosphor-icons/react";

// Uso básico
<PhoneCall size={24} weight="light" />
<ChartLineUp size={24} weight="bold" />
<Robot size={32} weight="light" />
```

### Em cards de feature

```tsx
<Target size={24} weight="light" className="text-[hsl(150,100%,50%)]" />
```

---

## 08 · Instalação

```bash
npm install @phosphor-icons/react
```

> **Importante:** Não usar sufixo "Icon" nos nomes. É `Target`, não `TargetIcon`.

---

## 09 · Regras

1. **Sempre** usar `weight="light"` como padrão
2. **Nunca** misturar Lucide e Phosphor no mesmo componente
3. **Migrar** gradualmente componentes existentes de Lucide → Phosphor
4. **Tamanho** deve seguir a escala definida (16/20/24/32/48)
5. **Cor** deve usar tokens semânticos ou as cores definidas neste documento
