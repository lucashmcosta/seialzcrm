## Diagnóstico
Você tem razão: o erro **não foi resolvido**. O que confirmei é:

- o navegador do usuário continua quebrando no **mesmo bundle deployado**: `index-BEYhe6zT.js`
- no código atual, `/reports` **já não depende mais diretamente de Recharts** para render inicial, então o primeiro diagnóstico ficou incompleto
- o caminho síncrono que ainda sobra em `/reports` é principalmente:
  `ReportsPage -> ReportFilters -> Calendar -> buttonVariants -> Button -> framer-motion / react-day-picker / radix`
- além disso, o `vite.config.ts` está com **manualChunks muito agressivo**, e isso é um padrão conhecido de Vite/Rollup para gerar erro de TDZ (`Cannot access 'X' before initialization`) em produção

## Do I know what the issue is?
**Sim.** O problema agora é um **TDZ de produção causado por ordem de inicialização entre chunks/módulos**, concentrado no stack de filtros/calendário compartilhado e amplificado pela estratégia atual de `manualChunks`.

O fix anterior atacou um hotspot provável, mas **não removeu a cadeia real que ainda entra primeiro no `/reports`**.

## Plano de correção

### 1. Desacoplar a lógica de período da UI pesada
Vou extrair `computeRange` e os tipos de período para um util leve, por exemplo `src/lib/report-period.ts`, para que:
- `ReportsPage.tsx`
- `Dashboard.tsx`

possam compartilhar a lógica sem importar junto `react-day-picker`, `Calendar`, `Popover` e `Button`.

### 2. Simplificar o filtro de relatórios para eliminar o caminho frágil
Vou refatorar `src/components/reports/ReportFilters.tsx` para não puxar a cadeia mais sensível na renderização inicial.

Direção do patch:
- manter o `Select` de presets
- substituir o calendário popover por uma versão mais segura para produção, com inputs de data leves ou carregamento isolado do seletor customizado
- preservar o comportamento funcional do filtro, mas reduzir o acoplamento com `calendar.tsx` e `button.tsx` no primeiro render

Isso também será aplicado ao `Dashboard`, porque ele reutiliza o mesmo filtro.

### 3. Corrigir a estratégia de chunking do Vite
Vou ajustar `vite.config.ts` para remover a divisão excessiva de vendor chunks.

Em vez de separar vários grupos (`radix`, `datepicker`, `icons`, `supabase`, `tanstack` etc.), vou:
- deixar o Vite decidir automaticamente, **ou**
- manter no máximo uma divisão bem coarse, como `charts`

Objetivo: impedir que módulos interdependentes sejam inicializados fora de ordem no bundle de produção.

### 4. Adicionar diagnóstico temporário para eliminar adivinhação
Se ainda restar qualquer crash depois disso, vou adicionar logs temporários em pontos estratégicos de inicialização:
- entrada de `ReportsPage`
- carga do filtro
- carga dos blocos lazy

Assim, o próximo erro deixa de ser apenas `Lt` minificado e passa a apontar o módulo real.

### 5. Validação final
Depois do patch, vou validar que:
- o hash do asset muda e **deixa de ser `BEYhe6zT`**
- `/reports` abre sem tela branca
- `Dashboard` continua funcionando com os filtros
- presets e intervalo customizado continuam corretos

## Arquivos que vou mexer
- `src/pages/reports/ReportsPage.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/reports/ReportFilters.tsx`
- `vite.config.ts`
- possivelmente um novo util, como `src/lib/report-period.ts`

## Resultado esperado
Remover a causa real do TDZ em produção, parar a tela branca em `/reports`, e deixar o bundle menos frágil para próximos deploys.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>