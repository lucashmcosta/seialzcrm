# Ligação cliente ↔ processo (Nammux) — medição de 2026-11-18

Quantos clientes do atendimento não têm processo ligado, quantos processos do
Nammux não chegam ao Seialz, e o que daria para casar. Consultas somente-leitura
em produção, na única organização com a integração ligada. Só contagens.

## Como o processo se liga ao cliente hoje

Só por um caminho: contato → negócio (`opportunities.contact_id`) →
`nammux_process_snapshots.opportunity_id`. O Nammux só envia eventos de processo
que nasceu de um negócio do Seialz. Processo cadastrado direto no Nammux não
aparece no Seialz: o agente de atendimento não o enxerga e nenhum aviso sai.

## Números

### Processos no Nammux

| | Total | Com audiência, perícia ou entrevista futura |
|---|---|---|
| Com vínculo de negócio do Seialz | 1.207 | 369 |
| Sem vínculo | 931 | 144 |

Dos processos com compromisso futuro, **28% (144 de 513) não têm vínculo**: o
cliente não receberia aviso nem lembrete.

### O que casaria — processos sem vínculo

Comparação do cliente do processo com os contatos do Seialz, por CPF e por
telefone (DDD + 8 últimos dígitos).

| | Todos (925 com cliente) | Com compromisso futuro (144) |
|---|---|---|
| Casa por CPF | 249 (26%) | **76 (52%)** |
| Casa só por telefone | 2 | 0 |
| Tem CPF ou telefone, mas não existe no Seialz | 51 | 6 |
| **Sem CPF nem telefone no cadastro do Nammux** | 623 (67%) | **62 (43%)** |

Outros 6 processos sem vínculo não têm nenhum cliente cadastrado.

### Contatos que falaram com o atendimento (90 dias)

| | Contatos |
|---|---|
| Falaram com o atendimento | 1.520 |
| Com processo ligado | 1.035 (68%) |
| Sem processo ligado | 485 (32%) |
| — destes, casam por CPF com cliente de processo sem vínculo | **120** |
| — destes, casam só por telefone | 0 |
| — têm CPF no Seialz (com ou sem par no Nammux) | 199 |
| — só têm telefone | 286 |

Na organização: 23.693 contatos, 1.612 com CPF válido (6,8%).

### Controle do método

O mesmo casamento aplicado aos processos **com** vínculo (onde se sabe que o
cliente existe no Seialz): 1.189 de 1.206 casam por CPF (98%), 16 só por
telefone, 1 sem dado. O método acha o que existe.

## Leitura

1. **CPF resolve; telefone não acrescenta.** Casar por telefone renderia 2
   processos, porque o cliente de processo sem vínculo quase nunca tem telefone
   no Nammux. E telefone troca de dono. Não vale o risco.
2. **Casar por CPF sobe a cobertura dos avisos de 72% para 87%** dos processos
   com compromisso futuro (369 → 445 de 513), e dá processo a 120 contatos que
   já falam com o atendimento.
3. **O teto é o cadastro do Nammux.** 62 processos com compromisso futuro não
   têm CPF nem telefone do cliente. Nenhum casamento automático os alcança: é
   preencher o CPF no Nammux.
4. **Um CPF aparece em mais de um contato do Seialz.** Caso assim não pode
   ligar sozinho; vai para uma pessoa decidir.
5. Dos 485 contatos do atendimento sem processo, 286 só têm telefone. Sem CPF
   no Seialz não há como casá-los com segurança; boa parte deve ser de quem
   ainda não é cliente.

## Proposta

Ligar por contato, além de por negócio, **só por CPF**:

- `nammux_contact_links` (contato do Seialz ↔ processo do Nammux), com
  `match_method` (`opportunity`, `cpf`, `manual`) e `status` (`confirmed`,
  `suggested`, `rejected`). CPF igual e único liga sozinho; CPF em mais de um
  contato vira sugestão para uma pessoa confirmar.
- O CPF não trafega em claro: os dois lados comparam um HMAC do CPF feito com
  o segredo da integração, que os dois já têm.
- `opportunity_id` passa a ser opcional nas tabelas `nammux_process_*` (são da
  integração, não do núcleo); o contexto do agente e a fila de avisos acham o
  processo pelo negócio ou pelo link de contato.
- No Nammux, os eventos passam a sair também para processo cujo cliente tem
  link de contato confirmado.

Fora do alcance da integração: preencher o CPF dos 62 processos sem dado.
