# SuvSign V2 — trocar painel lateral por modal central

Somente visual. Backend, `signature-requests`, snapshot, webhook, SuvSign, Nammux, idempotência, participantes, multiseleção, V1, botão V1, flags e credenciais não mudam.

## O que muda
- O painel lateral vira modal central (`Dialog` já usado no Seialz, de `@/components/ui/dialog`). Terá overlay, X no canto e as medidas abaixo.
  - Desktop: `max-w-[1040px]`, `max-h-[90dvh]`.
  - Mobile: `w-[calc(100vw-16px)]`, sem scroll horizontal.
- Cabeçalho fixo com o título "Assinatura de contrato" e o subtítulo atual. O corpo tem scroll interno, com `scrollbar-hide`. Os botões de cada etapa ficam em um rodapé fixo.
- **Lista:** "Novo envio" no topo. Cada solicitação vira um card com status em destaque, datas (criado, enviado, concluído), participantes (nome, e-mail, status, horário) e documentos agrupados, um por linha, com "Baixar". As ações Atualizar/Cancelar ficam menores.
- **Escolha dos documentos:** linhas selecionáveis inteiras com checkbox visível e nome em destaque. Abaixo do nome aparecem as informações que já existem (ex.: páginas, se vierem da listagem). Os modelos incompatíveis ficam desabilitados, com o motivo. O rodapé mostra "N documentos selecionados" e o botão "Preencher com dados do CRM".
- **Prévia:** no desktop, a lista de documentos fica à esquerda e a prévia grande à direita. No mobile, um seletor simples fica acima da prévia. O aviso de "uma única solicitação" e o botão "Enviar N documentos" continuam iguais.
- Tudo no mesmo modal, trocando por etapa, sem abrir um modal sobre outro.

## Detalhes técnicos
- Arquivo alterado: `src/components/signature/SignatureV2Sheet.tsx`. O nome e as props do componente continuam iguais, então quem o chama não muda.
- As funções de estado, as chamadas (`callSignatureRequests`), a sanitização DOMPurify e os textos de ação ficam idênticos. Só muda o JSX e as classes, usando tokens semânticos.
- Verificação: build OK. Se possível, um print da tela no preview (a tela exige login e o piloto da Central).

Final: `FLUXO SUVSIGN V2 MIGRADO PARA MODAL CENTRAL — SEM ALTERAÇÃO FUNCIONAL`
