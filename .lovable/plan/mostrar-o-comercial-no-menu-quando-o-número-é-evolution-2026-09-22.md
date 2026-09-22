# Mostrar o Comercial no menu quando o número é Evolution

## O que está acontecendo

O vínculo do número deu certo: na conta MSM existe um número de WhatsApp ativo com destino Comercial (`+55 27 99750-2059`, provedor Evolution).

O item **Comercial** no menu não aparece porque a regra que decide isso olha apenas para as integrações Twilio e Meta Cloud cadastradas em "Integrações". O Evolution não cria esse cadastro — ele registra o número direto. Conferi: a conta MSM não tem nenhuma linha de integração, e nenhuma conta do sistema tem a integração Evolution marcada como ativa. Ou seja, **toda conta que usa só Evolution fica sem o menu Comercial**, e com ele sem Modelos e Respostas Rápidas.

Na Central Trabalhista o menu aparece porque lá existe também Meta/Twilio ativos, o que esconde o problema.

## O que vou fazer

Trocar a regra: o Comercial passa a aparecer quando a conta tem **qualquer número de WhatsApp ativo**, independente do provedor (Evolution, Meta Cloud ou Twilio) — que é exatamente o que a pessoa acabou de configurar. Continua escondido para contas que não têm nenhum número.

Nada muda nas contas que hoje já veem o menu; o Atendimento também segue como está.

## Detalhes técnicos

- `src/hooks/useWhatsAppIntegration.ts`: a consulta `whatsapp-any-enabled` passa a considerar ativo se **ou** existe `organization_integrations.is_enabled` com slug `twilio-whatsapp`/`meta-whatsapp-cloud`, **ou** existe `communication_endpoints` da organização com `channel='whatsapp'` e `is_active=true` (cobre `provider='evolution_api'`). Uma consulta adicional leve, mesma chave de cache e mesmo `staleTime`.
- Os demais campos do hook (`whatsappNumber`, `messagingServiceSid`, `integrationId`, etc.) continuam vindo da configuração Twilio — nenhum consumidor deles muda de comportamento.
- `src/components/Layout.tsx` não muda: continua usando `hasWhatsApp` nos dois layouts (Seialz e padrão).
- Verificar quem mais usa `hasWhatsApp` (Modelos/Respostas Rápidas em Configurações) para confirmar que aparecer nessas contas é o desejado — é, já que o número existe.
- Sem migration, sem mudança em RLS, sem alteração de envio ou roteamento.
