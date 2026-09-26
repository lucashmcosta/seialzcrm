# Preparar a conta real da Central Trabalhista para o E2E V2

## Quem faz cada parte
Os itens 1–3 (criar a API key, o webhook V2 e a regra LIVE `source=seialz`) são configurações **dentro da SuvSign**. Este projeto (Seialz) não tem acesso ao painel nem ao banco da SuvSign, então não consigo criá-las daqui. Elas precisam ser feitas no projeto SuvSign. Do lado do Seialz, a minha parte é:

1. **Guardar a chave da Central no Seialz de forma segura**
   - Você gera o valor da chave `Seialz Central V2` e um webhook secret forte (por exemplo, `openssl rand -hex 32`).
   - Você cola os dois no cartão "SuvSign V2" em Integrações, logado na Central. Eles substituem a credencial atual `…6016`, de conta não confirmada.
   - Os valores são gravados cifrados. Eu nunca vejo nem registro os valores.
   - Na SuvSign, a mesma chave é registrada só como hash, na conta `49cfac40-…7815`. O mesmo secret vai no webhook `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/suvsign-v2-webhook`, com os eventos document.sent, signatory.signed e document.completed.
2. **Confirmar os templates reais (só leitura)**
   - Com a chave nova, chamo `list_templates` e, para os 3 compatíveis, a definição V2 (`?include=v2_definition`). As chamadas passam pela própria função `signature-requests`, com uma sessão de usuário da Central.
   - Esperado: Procuração, Contrato Unificado e Contrato Unificado 2 compatíveis; Contrato incompatível (`invalid_fields`).
   - Nas definições V2: `role-client` e Kaik com fields. O `client` sem field pode aparecer no Unificado 2 e é ignorado.
   - Também rodo a montagem de participantes em modo de teste, sem gravar nada, para mostrar os participantes finais de cada documento.
3. **Não fazer:** criar operação, enviar, criar sessão de assinatura, mandar e-mail, mexer no V1, na QA, nos templates ou no schema. Também não chamo `test_connection`, porque ele grava log. Uso só leituras.
4. **Relatório** nos 14 itens pedidos. Os itens 1–6 aparecem como "depende da SuvSign" até você confirmar que foram criados lá.

## Bloqueios
- As sessões de teste do preview não entram como usuário da Central. Para o item 2, preciso que você me deixe entrar como um usuário da Central no preview, ou que você mesmo abra "Novo envio" logado e me mande um print da lista.
- A chave e o secret só podem ser colados por você.

## Detalhes técnicos
- Nenhuma mudança de código ou banco no Seialz.
- A credencial é gravada pela ação existente `save_credentials` (AES-GCM, só admin da org). As leituras usam `list_templates` e a mesma `suvsignFetch` / `baseUrl`.
