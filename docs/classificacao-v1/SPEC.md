# Classificação de processos no Seialz — especificação da v1

Central Trabalhista · motor 1.0.0 · calibração v1 · 16/10/2026

## 1. O que é

Um widget dentro da oportunidade do Seialz. O vendedor responde um passo a passo sobre o caso trabalhista que está vendendo. No final ele vê duas coisas: **a classificação do processo** (Prata, Ouro, Titânio ou Diamante) e **a comissão dele nesta venda**. Nada além disso.

Por trás, um motor calcula, tese por tese, quanto o processo vale e qual a chance de ganhar. Com isso chega à faixa e à comissão. Os números ficam com o jurídico e a gestão, para QA, recalibração e, no futuro, comparação com a jurimetria.

O administrador calibra os números numa tela própria. Cada calibração publicada vira uma **versão** que não muda mais. Cada classificação guarda a versão do motor e a da calibração que usou.

## 2. O que já está validado e NÃO muda nesta v1

Tudo o que está em `motor/` foi validado pelo Lucas com o Renan (jurídico) no protótipo `referencia/motor_comercial_v3.html` e na versão do vendedor `referencia/widget_vendedor.html`.

| Item | Onde está | Regra |
|---|---|---|
| Regras de cálculo (13 teses, ônus da prova, testemunha global, corte de 21+ funcionários, justa causa, rescisão indireta, vínculo, multa 477, gestante, acidente/doença, dano moral etc.) | `motor/src/motor.ts` | Copiar como está. |
| Perguntas, textos, quando cada pergunta aparece, valor que já vem marcado | `motor/src/perguntas.ts` | Copiar como está. |
| Faixas por valor + ajuste por score (10 faixas de 10%) | calibração `_faixas` | Modelo atual. **Sem curva, sem volume** nesta v1. |
| Calibração inicial | `motor/dados/calibracao-v1.json` | Semente. O Lucas vai importar a calibração final exportada do protótipo (ver §8.5). |

**Prova de que o pacote faz igual ao protótipo:**
- 21.000 casos aleatórios com calibrações aleatórias, 91.370 teses calculadas. Resultado idêntico ao protótipo em valor, chance, aviso, texto de detalhe, faixa, comissão e score. Zero diferenças.
- As perguntas foram comparadas em 39.000 telas de tese (107.145 perguntas): mesma ordem, mesmo texto, mesmas opções, mesma condição para aparecer e mesmo valor marcado. Zero diferenças.
- 475 testes automáticos em `motor/tests/`:
  - regras jurídicas, uma por teste;
  - 400 casos-ouro conferidos contra o protótipo;
  - importação e conferência da calibração.

Correções feitas durante essa conferência (já aplicadas também nos protótipos):
1. **Divisão por zero.** Calibrar em 0% a chance-base da gestante (dispensa) ou da estabilidade B91, ou zerar o valor de uma situação de dano moral, travava o cálculo. Agora dá 0, sem erro.
2. **Grau que já recebe (insalubridade).** A tela mostrava "10%" marcado, mas o cálculo assumia 20%. A tela passou a mostrar 20%, que é o que o cálculo sempre usou. O resultado não muda.

Mudar uma regra exige nova versão do motor (§9) e casos-ouro novos aprovados pelo Lucas.

## 3. Papéis e permissões

Encaixar no RBAC que já existe no Seialz (famílias dados / ferramentas / administração). Nomes sugeridos:

| Permissão | Família | Quem | O que libera |
|---|---|---|---|
| Classificar processo | ferramentas | vendedor | Usar o widget nas próprias oportunidades abertas. Vê só a faixa e a própria comissão. |
| Ver classificações | dados | gestor, jurídico | Lista e detalhe das classificações (respostas, faixa, comissão). O detalhe com chances e valores por tese fica só com o jurídico e o admin (permissão abaixo). |
| Ver números da classificação | dados | jurídico, admin | Chance, valor bruto/esperado, score e texto de detalhe de cada tese. |
| Liberar correção | ferramentas | gestor | Aceitar ou recusar um pedido de correção do vendedor. |
| Calibrar classificação | administração | admin | Editar o rascunho, simular, importar e exportar. |
| Publicar calibração | administração | admin (pode ser a mesma pessoa) | Publicar uma versão e restaurar uma anterior. |

O módulo liga e desliga **por tenant**. Ao ligar, o tenant recebe a calibração v1 como primeira versão publicada.

## 4. Onde roda o cálculo

- O cálculo do vendedor roda **no servidor** (edge function do Supabase). Usa `motor/dist/motor.mjs`, um arquivo único gerado do `motor/src`.
- O navegador do vendedor **nunca recebe** a calibração nem números do caso. Recebe só as perguntas (que estão no próprio código do widget) e, no fim, a faixa e a comissão.
- A tela do administrador pode rodar o motor no navegador, para simular na hora. O admin pode ver tudo. É o mesmo código do servidor, na mesma versão.
- O navegador do vendedor checa o que falta preencher com `pendenciaDaTese()`, que não precisa da calibração. O servidor confere de novo com o motor (`faltaPreencher`) antes de gravar.

## 5. Widget do vendedor

### 5.1 Onde aparece e estados

O widget fica na tela da oportunidade, seguindo o padrão do Seialz para cards ou abas. Ele tem estes estados:

| Estado | O que mostra |
|---|---|
| Oportunidade aberta, sem classificação | Cartão de entrada: "Classificação do processo" · "Responda algumas perguntas sobre o caso. No final você vê a classificação e a sua comissão desta venda." · aviso "Depois de finalizar, a classificação fica registrada nesta oportunidade e não dá para alterar." · botão **Começar classificação** |
| Preenchendo | Assistente passo a passo (§5.2) |
| Analisando | "Analisando o caso…" com indicador de carregamento por ~1,5 s, mesmo que o servidor responda antes |
| Classificada | Resultado travado (§5.4) + botão "Errei alguma resposta — pedir correção ao gestor" (só se a oportunidade estiver aberta e não houver pedido pendente) |
| Pedido de correção pendente | Resultado + "Pedido de correção enviado ao gestor em dd/mm/aaaa às hh:mm." |
| Correção liberada pelo gestor | Volta ao cartão de entrada; a nova classificação começa em branco, como no protótipo |
| Em revisão (comissão 0 pela tabela de score) | "Este processo vai para revisão do jurídico" · "A comissão é definida depois da revisão." |
| Fechada com classificação | Resultado + "Oportunidade fechada — classificação final." com o ícone de cadeado do design system. Sem botão de correção. |
| Fechada sem classificação | "Oportunidade fechada sem classificação" · "A classificação só pode ser feita com a oportunidade aberta. Fale com o gestor." |

Regras:
- **Uma classificação ativa por oportunidade.** O banco garante isso, e não só a tela.
- Só classifica com a oportunidade **aberta**. Se ela fechar enquanto o vendedor preenche, o "Finalizar" mostra "A oportunidade foi fechada: não dá mais para classificar." e não grava nada.
- **Não deixar marcar como ganha sem classificação.** Com o módulo ligado, mudar a oportunidade para ganha sem classificação ativa mostra "Classifique o processo antes de marcar como ganha." Vale no servidor também, e não só no botão.

### 5.2 Passos (tudo vem de `perguntas.ts`)

1. **Dados do contrato** (`PASSO_DADOS`): salário, meses de vínculo, nº de funcionários, dias por semana (padrão 5). As mensagens de erro estão em `validar`.
2. **Como terminou o contrato** (`PASSO_SAIDA`): saída, as perguntas que dependem da saída (`cond`), trabalho interno/externo e testemunha. Ao escolher "Sem registro", marcar sozinho as teses de `AUTO_SEM_REGISTRO` e a situação `informalidade` no dano moral. O vendedor pode desmarcar.
3. **Quais direitos o caso tem?**: as 13 teses (`NOME_TESE`), marcação múltipla. Pelo menos uma.
4. **Uma tela por tese marcada**, na ordem em que foram marcadas:
   - perguntas de `perguntasVisiveis(tese, respostas, contexto)`, recalculadas a cada resposta (uma pergunta pode aparecer ou sumir);
   - o "Próximo" trava com a mensagem de `pendenciaDaTese()`.
5. **Confira antes de finalizar**: resumo (contrato, saída e extras, trabalho e testemunha, teses) + "Depois de finalizar, a classificação fica registrada e não dá para alterar. Confira antes." Botão **Finalizar**.

Títulos e subtítulos de cada passo: `TITULOS_PASSO`. Topo: "Passo N de M" + barra de progresso. Navegação: Voltar / Próximo.

**O que enviar ao servidor:**
- a `Entrada` (tipo em `tipos.ts`) com **todas as perguntas visíveis**, já com o valor marcado (`padraoDe`) quando o vendedor não mexeu;
- perguntas escondidas não vão;
- os campos sim/não do topo viram `true`/`false`.

Um teste garante que "valor marcado na tela = valor que o motor assume". O servidor recalcula tudo e não confia em nenhum número vindo do navegador.

### 5.3 O que o vendedor NUNCA vê

Percentuais, valores do processo, score, faixa por valor, detalhe por tese e as outras faixas (não mostrar a "escada" Prata→Diamante). Também não existe tela para reclassificar e testar. Isso evita que o vendedor aprenda a lógica para inflar a comissão.

### 5.4 Revelação do resultado (reaproveitar a interação do protótipo)

- **Material** da faixa em `widget/icones/` (`prata.svg`, `ouro.svg`, `titanio.svg`, `diamante.svg`): barra de prata, barra de ouro, placa sextavada de titânio, diamante lapidado. Os IDs internos já são únicos, então podem aparecer juntos na mesma página.
- **Movimento** (referência em `widget/icones/animacoes-referencia.css`):
  - o material entra com escala e brilho e depois flutua devagar;
  - faíscas saem do centro: 18 (Prata/Ouro), 24 (Titânio), 30 (Diamante);
  - tocar no material faz ele pular e soltar 16 faíscas.
- **Texto:** "Este é um processo **{Faixa}**" (Prata / Ouro / Titânio / Diamante, com acento).
- **Comissão:** "Sua comissão desta venda" + "+ R$ {valor}". O valor conta de 0 até o final em 1,1 s (desacelerando), começa 0,9 s depois da revelação e dá um pulso no fim.
- **Mensagem por faixa:**
  - Prata: "Bom trabalho!" · "Mais uma venda no seu mês."
  - Ouro: "Mandou bem!" · "Venda de qualidade."
  - Titânio: "Excelente venda!" · "Caso forte e bem fechado."
  - Diamante: "Venda espetacular!" · "Esse é dos grandes."
- **Rodapé:** "Classificado em dd/mm/aaaa às hh:mm · Oportunidade #id".
- Ao reabrir uma oportunidade já classificada, mostrar o resultado **sem** animação.
- Respeitar `prefers-reduced-motion`: sem animação, resultado direto.

### 5.5 Visual

- **Seguir o design system do Seialz** (componentes, tipografia, espaçamento, botões, chips, campos, cores, ícones), nos temas claro e escuro. **Não copiar o CSS do protótipo.**
- Do protótipo, reaproveitar só os desenhos dos materiais, os movimentos da revelação e o fluxo passo a passo.
- As cores de destaque da faixa podem vir dos materiais, mas o contraste precisa passar nos dois temas. Exemplo: o brilho branco do diamante some no tema claro, então ele deve usar um token claro/escuro.
- Funcionar no celular: o vendedor usa muito no telefone.

## 6. Correção pelo gestor

1. O vendedor toca em "Errei alguma resposta — pedir correção ao gestor". Isso cria um pedido pendente e avisa o gestor pelo canal de notificação que o Seialz já usa.
2. O gestor vê os pedidos pendentes. Para decidir, vê as respostas do vendedor, a faixa e a comissão.
3. **Liberar:** a classificação atual continua valendo até a nova ser finalizada. Quando a nova for finalizada, a antiga vira "substituída" e aponta para a nova. **Recusar:** grava o motivo e o vendedor vê que foi recusado.
4. Com a oportunidade fechada, nada se mexe: nem pedido, nem liberação.

## 7. Dados a guardar (conceitual; criar as migrações no padrão do repositório, com RLS por tenant)

**Versão de calibração**
- tenant, número sequencial (v1, v2…)
- situação: rascunho, publicada ou arquivada
- conteúdo (JSON no formato de `Calibracao`, o mesmo do "Exportar" do protótipo)
- versão do motor para a qual foi feita
- baseada em (versão de origem)
- nota da publicação (obrigatória)
- criada por/em, publicada por/em

Regras:
- **Publicada é imutável.** Só uma publicada por tenant de cada vez.
- Restaurar uma versão antiga = criar um rascunho novo a partir dela e publicar. O histórico nunca é editado.

**Classificação**
- tenant, oportunidade, vendedor, data e hora
- versão do motor e versão da calibração usadas
- a `Entrada` exatamente como foi calculada
- o `ResultadoCaso` completo: por tese, valor, chance, chance automática, selo, aviso, detalhe e se foi excluída; e do caso, totais, solidez, score, composto, faixa por valor, ajuste do score, faixa final, comissão e se está em revisão
- campos de consulta rápida: faixa, comissão, score, valor bruto, esperado e composto
- situação: ativa, substituída ou anulada; "substitui" (classificação anterior); quem liberou

**Pedido de correção**
- classificação, vendedor, data
- situação: pendente, liberado ou recusado
- gestor, data da decisão, motivo

**Desfecho (preparar para a jurimetria; a tela de cadastro pode ficar para a v2)**
- oportunidade/processo (número CNJ quando houver)
- por tese: resultado (procedente, parcial, improcedente ou acordo), valor obtido, data, fonte

Com isso dá para comparar, por tese e por faixa de chance, o previsto pelo motor com o que aconteceu, e recalibrar.

LGPD:
- A `Entrada` não tem nome, CPF ou contato. Mesmo assim, fica no banco do tenant, protegida por RLS.
- Não mandar entradas, resultados nem calibrações para logs ou serviços externos.

## 8. Tela do administrador — calibração

### 8.1 Seções (as mesmas do protótipo, no visual do Seialz)

- **Teses.** Para cada tese:
  - as chances, com o rótulo e a explicação jurídica do `CATALOGO` (o "porquê" de cada número);
  - os valores de referência;
  - na insalubridade, os agentes (grau, chance, chance com EPI, chance fora do caso);
  - no dano moral, as situações (valor e chance);
  - o peso da tese no score.
- **Faixas e comissão:**
  - limites de valor e comissão de cada faixa;
  - peso do tamanho × solidez;
  - base da faixa (composto, bruto ou esperado);
  - as 10 faixas de score (mover a faixa de −3 a +2 e % da comissão), com a matriz "faixa por valor × faixa de score" mostrando o resultado de cada combinação.
- **Geral:** selos forte/média, salário mínimo, fator de reflexos.
- **Simular:** o admin preenche um caso (mesmas perguntas do vendedor) e vê tudo: por tese chance, valor, detalhe e selo; score, composto, faixa e comissão. Tudo calculado com o rascunho, na hora.

### 8.2 Versões

- **Rascunho:** editável, salva sozinho (o protótipo perdia ajustes; aqui não pode). "Descartar rascunho" volta para a publicada.
- **Publicar:**
  1. roda `conferirCalibracao()` (se houver problema, não publica);
  2. mostra a lista do que mudou (`compararCalibracoes()`, com nomes legíveis e antes → depois);
  3. pede a nota;
  4. publica.
- **Histórico:** lista de versões com quem, quando e nota. Abrir uma versão mostra o que mudou em relação à anterior. **Restaurar** cria um rascunho a partir dela.
- **Exportar / Importar** JSON no formato do protótipo. O import usa `mesclarCalibracao()`: número que não existe mais é ignorado e listado; número novo fica com o valor atual. O import cai no rascunho e nunca publica direto.
- **Restaurar padrão** = rascunho a partir de `CALIBRACAO_V1`.
- Publicar **não muda classificações antigas**: cada uma fica com a versão e a comissão que teve. Só as próximas usam a nova.

### 8.3 Prévia de impacto (antes de publicar)

1. Recalcular com o rascunho as classificações ativas dos últimos N dias (padrão 90), usando a `Entrada` gravada de cada uma.
2. Mostrar:
   - quantas sobem, descem ou ficam (matriz faixa atual × faixa nova);
   - comissão total atual × nova;
   - diferença por vendedor;
   - os casos que mais mudaram, com link.

É só uma simulação: não grava nada nas classificações.

### 8.4 Relatórios / QA

- Lista de classificações com filtros: período, vendedor, faixa, versão de calibração, em revisão e substituídas.
- Detalhe completo para quem tem permissão.
- Exportar CSV, uma linha por classificação × tese, com versões, chance, valor, faixa e comissão. É a base para comparar com a jurimetria.

### 8.5 Primeira carga

O Lucas exporta a calibração final do protótipo (botão "Exportar calibração" no `motor_comercial_v3.html`, no navegador onde ele calibrou) e importa na tela do admin como v2, com a nota "calibração validada com o Renan". Até lá vale a semente v1.

## 9. Versionamento

- **Versão do motor** (`MOTOR_VERSAO`, no código):
  - **patch:** texto ou correção que não muda nenhum resultado dos casos-ouro;
  - **minor:** pergunta ou tese nova (os casos antigos dão o mesmo resultado);
  - **major:** regra que muda resultado.

  Toda mudança: rodar `npm test`, atualizar os casos-ouro **com aprovação do Lucas** e anotar no CHANGELOG.
- **Versão da calibração:** só números, sequencial por tenant (§8.2).
- Se o motor ganhar números novos de calibração, as versões publicadas continuam valendo. O próximo rascunho é feito com `mesclarCalibracao(publicada, novaSemente)`, e os números novos entram com o valor padrão.
- Cada classificação grava as duas versões. Por isso sempre dá para explicar e reproduzir uma comissão antiga.

## 10. Critérios de aceite

1. `npm test` em `motor/` passa (475 testes) no CI do Seialz.
2. O mesmo caso preenchido no protótipo `referencia/widget_vendedor.html` e no Seialz, com a mesma calibração, dá a mesma faixa e a mesma comissão. Conferir pelo menos 10 casos variados, incluindo sem registro, justa causa, gestante e insalubridade × periculosidade.
3. O vendedor não consegue obter nenhum número além da própria comissão, nem pela tela nem pelas respostas da API.
4. Não é possível ter duas classificações ativas na mesma oportunidade (testar dois cliques e duas abas).
5. Oportunidade fechada: não classifica, não pede correção e não libera. Marcar como ganha sem classificação é bloqueado.
6. Publicar calibração: não publica com problema; exige nota; versão publicada não muda; restaurar cria rascunho; classificações antigas mantêm versão e comissão.
7. Importar o JSON exportado do protótipo funciona e lista o que foi ignorado.
8. A prévia de impacto bate com o recálculo manual de 3 casos.
9. Visual no design system do Seialz, claro e escuro, celular e desktop, com `prefers-reduced-motion` respeitado.
10. Permissões do §3 funcionando por papel, com isolamento por tenant.

## 11. Fora desta v1

- Curva contínua de comissão e peso por volume (modelo B) e bônus semanal.
- Cadastro do desfecho e comparação automática com a jurimetria (a v1 só guarda o necessário).
- Pensão vitalícia (acidente/doença) e seguro-desemprego: decisão do Lucas, não entram no valor.
- Nova classificação já preenchida com as respostas anteriores após correção (o protótipo começa em branco).

## 12. Pontos para o Claude Code confirmar com o Lucas antes de codar

- Onde exatamente o widget entra na oportunidade (aba, card lateral, modal).
- Qual status do Seialz é "aberta", "ganha" e "perdida" para este funil.
- Se já existe módulo ou relatório de comissão no Seialz em que o valor deve entrar, e se a comissão só vale com a oportunidade ganha.
- Quem são os gestores de cada vendedor (para notificar o pedido de correção).
