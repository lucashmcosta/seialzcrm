# Por que "Comercial" (mensagens) não aparece no menu da Squadra

## Causa confirmada

O item **Comercial** só entra no menu quando a conta tem uma integração de WhatsApp **ativa**. Consultando a base agora: as duas contas chamadas "Squadra" **não possuem nenhuma integração cadastrada** — nem WhatsApp, nem qualquer outra. Por isso o menu esconde Comercial (e também Templates e Respostas Rápidas nas Configurações).

O menu de **Atendimento** aparece sempre, independente de integração — foi por isso que ele está visível e o Comercial não.

## Achado adicional (segundo problema)

A verificação usada pelo menu considera apenas WhatsApp da Meta (Cloud API) e da Twilio. O provedor **Evolution** existe no catálogo de integrações, mas não é reconhecido por essa verificação. Ou seja: uma conta que use somente Evolution ficaria sem o menu Comercial mesmo estando corretamente conectada.

## O que fazer

Escolha do usuário entre:

1. **Ativar o WhatsApp na Squadra** (caminho normal): conectar o provedor desejado em Configurações > Integrações. Assim que a integração ficar ativa, o Comercial aparece sozinho, sem mudança de código.
2. **Corrigir a lacuna do Evolution**: incluir o provedor Evolution na verificação que libera os menus de WhatsApp, para que contas em Evolution passem a ver Comercial, Templates e Respostas Rápidas.

As duas coisas são independentes e podem ser feitas juntas.

## Detalhes técnicos

- `src/components/Layout.tsx`: item `/commercial` é adicionado somente sob `if (hasWhatsApp)` (nos dois layouts, Seialz e padrão); `/inbox` é adicionado sem condição.
- `src/hooks/useWhatsAppIntegration.ts`: `hasWhatsApp` vem da query `whatsapp-any-enabled`, que filtra `admin_integrations.slug in ('twilio-whatsapp','meta-whatsapp-cloud')` com `is_enabled = true`. O slug `evolution-whatsapp` existe em `admin_integrations` e não está nessa lista.
- Base: `organization_integrations` não tem nenhuma linha para `4e57b6fb-54b8-4dce-b551-5d433f01cc21` nem para `21afb270-1c43-4f38-b18c-4cfa9b0156dc`.
- Opção 2 = acrescentar `'evolution-whatsapp'` ao `.in(...)` do hook. Nenhuma outra regra de negócio muda; `SettingsLayout` já reaproveita o mesmo `hasWhatsApp` para as rotas protegidas por flag.
