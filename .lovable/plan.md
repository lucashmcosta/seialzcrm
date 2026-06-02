## Polimento visual — Tela de Atendimento

Apenas estética/respiro. Nenhuma mudança de lógica, dados, query, edge function ou layout estrutural (mantém as 4 colunas: Filas · Lista · Conversa · Painel). Inspiração da Imagem 2 (Divus): mais ar, bolhas leves, composer baixo e limpo. Não copiar — manter padrão Seialz (Outfit, border-radius 6px, tokens semânticos).

---

### 1. Header da conversa (`InboxThreadDetail.tsx`)

- Subir altura do header de `py-1.5` para `py-3` e padding lateral `px-6`.
- Nome do contato: passar de `text-base` para `text-[15px] font-semibold`, com avatar circular (iniciais) 32px à esquerda — usar `bg-muted text-foreground` (sem cor forte).
- Linha secundária: substituir "customer · endpoint: other · somente leitura" por chips discretos em vez de texto concatenado:
  - chip pequeno `Cliente` (verde suave `bg-emerald-500/10 text-emerald-700`)
  - chip pequeno `other` (cinza `bg-muted text-muted-foreground`)
- Chips de status/priority à direita: trocar `font-data text-[10px]` por `text-[11px]` capitalizado em vez de minúsculo cru.
- `WhatsAppWindowChip` continua à direita, sem mudança funcional.

### 2. Timeline (`InboxConversationTimeline.tsx`)

- Container: aumentar padding de `p-4 space-y-3` para `px-8 py-6 space-y-4`. Fundo `bg-muted/20` mantido.
- Limitar largura útil das mensagens: wrapper interno `max-w-3xl mx-auto w-full` para que em telas largas a conversa não estique de ponta a ponta.
- Bolhas:
  - aumentar padding de `p-2.5` para `px-3.5 py-2`.
  - aumentar `max-w-[75%]` para `max-w-[78%]` e `rounded-lg` para `rounded-2xl` (mais orgânico, padrão WhatsApp).
  - bolha outbound: trocar verde escuro `#054D3E` por `bg-primary text-primary-foreground` (alinha com design system Seialz).
  - bolha inbound: manter `bg-card` mas adicionar `shadow-sm` discreto.
- Label do remetente: subir de `text-[10px]` para `text-[11px]` com `mb-1`.
- Timestamp interno: `text-[11px]` em vez de `text-[10px]`.
- Espaço entre bolhas consecutivas do mesmo autor: agrupar visualmente removendo o label quando o autor anterior é igual (pequena melhoria — só esconder `senderLabel` se `prev.direction === current.direction && prev.sender_name === current.sender_name && diff < 2min`).

### 3. Composer (`InboxComposer.tsx`)

Esse é o ponto mais "feio" — placeholder gigante, ícones desalinhados.

- Wrapper externo: `px-6 pt-3 pb-4` com `bg-background border-t border-border`.
- Tabs Responder/Nota interna: reposicionar como pílulas finas e discretas (`h-7 px-3 rounded-full text-xs`), removendo a barra de "Atribuída a outro usuário" da linha das tabs — mover esse aviso para um chip pequeno acima do textarea quando aplicável.
- Aviso "Fora da janela 24h · use template": tirar daqui (já existe o `WhatsAppWindowChip` no header) — manter só dentro do placeholder, sem ruído extra.
- Caixa de digitação: empacotar `Textarea` + botões de mídia + áudio + enviar dentro de **um único container arredondado** (`rounded-2xl border bg-card px-3 py-2`), assim:

```
┌──────────────────────────────────────────────────┐
│  Digite uma mensagem                             │
│                                                  │
│  📎  📄                          🎙   ➤          │
└──────────────────────────────────────────────────┘
```

- `Textarea`: remover borda própria (`border-0 shadow-none focus-visible:ring-0 px-0 resize-none min-h-[44px] max-h-[160px]`), `rows={1}` com auto-grow.
- Placeholder enxuto:
  - janela aberta: `"Mensagem para {primeiroNome}"`
  - fora da janela: `"Selecione um template para iniciar"`
  - nota: `"Anotação interna visível só para a equipe"`
- Barra inferior dentro do container: ícones de mídia (📎 anexo, 📄 template) à esquerda, áudio + enviar à direita. Tamanho uniforme `h-8 w-8` ghost. Dica `Enter envia · Shift+Enter quebra linha` em micro-texto cinza embaixo do container (`text-[10px] text-muted-foreground/70 mt-1.5 px-1`), em vez de poluir o placeholder.
- Modo Nota interna: mesmo container, mas com `bg-amber-50/60 border-amber-200` e botão enviar âmbar.

### 4. Painel lateral (`InboxThreadDetail.tsx`)

- Trocar `w-[280px]` por `w-[300px]` para respirar.
- Padding `p-5` → `px-5 py-6`, `space-y-6` mantido.
- Títulos de seção: já estão bons (`uppercase tracking-wider`). Reduzir `mb-2` → `mb-3`.
- Labels (`dt`): `text-muted-foreground` ok; aumentar gap vertical `gap-y-2.5`.
- Adicionar separador sutil `<div className="h-px bg-border" />` entre Atendimento → Dados → Histórico (em vez de só espaçamento).

### 5. Lista de conversas (toque rápido)

- `InboxThreadList` (não reaberto aqui, mas no escopo): aumentar padding vertical dos itens (alvo `py-3.5`) e ajustar tamanho do nome para `text-sm font-medium`. Sem alterar estrutura.

---

### Fora de escopo
- Sem mudança em hooks, queries, realtime, migrations, edge functions.
- Sem mexer em InboxQueues, InboxMetricsBar, /messages, mobile.
- Sem novos componentes além de pequenos helpers locais (se necessário).

### Critério de aceite
- Conversa com claramente mais respiro lateral e vertical.
- Composer em uma caixa única arredondada, placeholder curto.
- Header com avatar + chips em vez de texto corrido.
- Mantém identidade Seialz (Outfit, 6px radius nos chips, tokens semânticos, sem cores hardcoded).
