// Gerado de dados/catalogo.json — rótulos e explicações de cada número (versão das regras).
export const CATALOGO: any = {
 "horas_extras": {
  "nome": "Horas extras",
  "probs": {
   "forte_sem_ponto": {
    "label": "21+ func, sem ponto, sem testemunha",
    "sub": "ônus da empresa (Súm.338,I)"
   },
   "forte_sem_ponto_test": {
    "label": "21+ func, sem ponto, COM testemunha",
    "sub": "ônus da empresa + prova oral"
   },
   "sem_ponto_peq": {
    "label": "Sem ponto, até 20 func, SEM testemunha",
    "sub": "sem obrigação legal → ônus do cliente, sem prova = quase perda"
   },
   "sem_ponto_peq_test": {
    "label": "Sem ponto, até 20 func, COM testemunha",
    "sub": "sem obrigação, mas prova oral supre"
   },
   "ponto_real_nao_pagou": {
    "label": "Ponto real, extras NÃO pagas",
    "sub": "factual — o próprio ponto prova o débito"
   },
   "fraude_sem_test": {
    "label": "Ponto NÃO mostra o real, SEM testemunha",
    "sub": "alega fraude mas ônus é do cliente — quase perda"
   },
   "fraude_com_test": {
    "label": "Ponto NÃO mostra o real, COM testemunha",
    "sub": "testemunha derruba o ponto falso"
   },
   "externo_sem_test": {
    "label": "Externo sem ponto, SEM testemunha",
    "sub": "art.62,I: sem obrigação de controle → ônus do cliente, sem prova = quase perda"
   },
   "externo_test": {
    "label": "Externo sem ponto, COM testemunha",
    "sub": "testemunha é a prova do cliente"
   }
  }
 },
 "intrajornada": {
  "nome": "Intervalo de almoço",
  "onus": "INTERNO 21+ func sem registro: concessão é fato extintivo → ônus da empresa. ATÉ 20 func (sem obrigação de ponto) ou EXTERNO (art.62): ônus do cliente, testemunha decide",
  "probs": {
   "pre_sem_test": {
    "label": "Ponto marca 1h mas não tirava, SEM testemunha",
    "sub": "pré-assinalação vale como prova da empresa → ônus do cliente derrubar, sem prova = quase perda"
   },
   "pre_test": {
    "label": "Ponto marca 1h mas não tirava, COM testemunha",
    "sub": "testemunha derruba a pré-assinalação"
   },
   "ponto_real_suprimido": {
    "label": "Ponto registra intervalo suprimido (<1h)",
    "sub": "o próprio ponto prova a supressão (Súm.437)"
   },
   "interno_sem_reg_test": {
    "label": "Interno 21+ func, sem registro, COM testemunha",
    "sub": "ônus da empresa + reforço"
   },
   "interno_sem_reg": {
    "label": "Interno 21+ func, sem registro, SEM testemunha",
    "sub": "obrigada a registrar (art.74 §2º) → ônus da empresa"
   },
   "peq_sem_reg_test": {
    "label": "Até 20 func, sem registro, COM testemunha",
    "sub": "sem obrigação de ponto, mas a testemunha prova"
   },
   "peq_sem_reg": {
    "label": "Até 20 func, sem registro, SEM testemunha",
    "sub": "sem obrigação de ponto → ônus do cliente, sem prova = quase perda"
   },
   "externo_test": {
    "label": "Externo, COM testemunha",
    "sub": "ônus do cliente, testemunha é a prova"
   },
   "externo_sem_test": {
    "label": "Externo, SEM testemunha",
    "sub": "art.62: ônus do cliente, sem prova = quase perda"
   }
  }
 },
 "noturno": {
  "nome": "Adicional noturno",
  "onus": "Se pagava algo, o trabalho noturno é incontroverso. Se não pagava, decide quem prova o horário após 22h: ponto real = prova pronta; 21+ func sem ponto = ônus da empresa; ponto falso, até 20 func sem ponto ou externo = ônus do cliente (testemunha decide)",
  "probs": {
   "ponto_real": {
    "label": "Ponto registra o horário após 22h e não pagava",
    "sub": "factual — o próprio ponto prova"
   },
   "grande_sem_ponto": {
    "label": "Sem ponto, 21+ func, SEM testemunha",
    "sub": "ônus da empresa (Súm.338,I)"
   },
   "grande_sem_ponto_test": {
    "label": "Sem ponto, 21+ func, COM testemunha",
    "sub": "ônus da empresa + prova oral"
   },
   "peq_sem_ponto": {
    "label": "Sem ponto, até 20 func, SEM testemunha",
    "sub": "sem obrigação de controle → ônus do cliente, sem prova"
   },
   "peq_sem_ponto_test": {
    "label": "Sem ponto, até 20 func, COM testemunha",
    "sub": "testemunha prova o horário"
   },
   "fraude_sem_test": {
    "label": "Ponto NÃO mostra o horário real, SEM testemunha",
    "sub": "ônus do cliente derrubar o ponto — quase perda"
   },
   "fraude_com_test": {
    "label": "Ponto NÃO mostra o horário real, COM testemunha",
    "sub": "testemunha derruba o ponto"
   },
   "externo_sem_test": {
    "label": "Externo sem ponto, SEM testemunha",
    "sub": "art.62: ônus do cliente, sem prova = quase perda"
   },
   "externo_test": {
    "label": "Externo sem ponto, COM testemunha",
    "sub": "testemunha prova o horário"
   },
   "pagou_a_menor": {
    "label": "Pagava, mas sem hora reduzida",
    "sub": "trabalho noturno incontroverso — cobra a diferença"
   }
  }
 },
 "insalubridade": {
  "nome": "Insalubridade",
  "onus": "resolve por PERÍCIA (art.195); a testemunha reforça (confirma exposição habitual e EPI não entregue/não usado). Cada agente tem anexo, grau e efeito do EPI próprios",
  "probs": {
   "reforco_test": {
    "label": "Reforço da testemunha (pontos)",
    "sub": "confirma a exposição e o EPI não usado/fiscalizado (Súm.289)"
   },
   "ja_recebe": {
    "label": "Recebe grau menor que o devido",
    "sub": "cobra só a diferença de grau (item 237)"
   },
   "agravante": {
    "label": "Reforço por agente adicional (pontos)",
    "sub": "cada agente a mais que se enquadra soma na chance"
   }
  },
  "agentes": {
   "biologico": {
    "label": "Biológico",
    "sub": "Anexo 14 — hospital, esgoto, lixo urbano",
    "epi": "luva/máscara/avental"
   },
   "frio": {
    "label": "Frio",
    "sub": "Anexo 9 — câmara fria, frigorífico",
    "epi": "roupa térmica/japona"
   },
   "calor": {
    "label": "Calor",
    "sub": "Anexo 3 — depende da medição IBUTG (forno, fundição, cozinha industrial)",
    "epi": "vestimenta de proteção térmica"
   },
   "quimico": {
    "label": "Químico",
    "sub": "Anexos 11/13 — grau varia conforme o produto",
    "epi": "luva/respirador"
   },
   "umidade": {
    "label": "Umidade",
    "sub": "Anexo 10 — trabalho encharcado",
    "epi": "bota/avental impermeável"
   },
   "ruido": {
    "label": "Ruído",
    "sub": "Anexo 1 — só acima do limite (~85 dB); protetor auricular costuma neutralizar",
    "epi": "protetor auricular",
    "fora": "ruído moderado/intermitente"
   },
   "poeira": {
    "label": "Poeira",
    "sub": "Anexo 12 — só poeira mineral (sílica, amianto, manganês); poeira comum não enquadra",
    "epi": "máscara PFF2/respirador",
    "fora": "poeira comum (madeira, farinha, terra)"
   }
  }
 },
 "periculosidade": {
  "nome": "Periculosidade",
  "onus": "resolve por PERÍCIA (art.195) — enquadramento mais objetivo; a testemunha reforça (confirma a atividade e a habitualidade)",
  "probs": {
   "reforco_test": {
    "label": "Reforço da testemunha (pontos)",
    "sub": "confirma a atividade de risco e a habitualidade"
   },
   "enquadra_claro": {
    "label": "Atividade claramente enquadrada (NR-16)",
    "sub": "eletricidade, inflamável/GLP, vigilância, motocicleta (art.193 §4º)"
   },
   "enquadra_duvidoso": {
    "label": "Enquadramento discutível",
    "sub": "depende do laudo"
   },
   "ja_recebe": {
    "label": "Recebe sobre base errada",
    "sub": "cobra só a diferença de base — holerite prova"
   }
  }
 },
 "verbas_rescisorias": {
  "nome": "Verbas rescisórias",
  "onus": "ônus da EMPRESA provar o pagamento (documental). MULTA 477: prazo de 10 dias para pagar E entregar os documentos (§6º). JUSTA CAUSA: ônus da EMPRESA provar a falta grave. RESCISÃO INDIRETA: ônus do CLIENTE provar a falta da empresa. SEM REGISTRO: se a empresa nega o trabalho, ônus do cliente; se admite e diz que era autônomo/PJ, ônus da empresa — e sem vínculo NENHUMA tese existe. Essas chances valem para todas as teses afetadas. Seguro-desemprego NÃO entra no valor (decisão comercial)",
  "probs": {
   "documental": {
    "label": "Não pagas — empresa tem que provar quitação",
    "sub": "TRCT/recibo"
   },
   "multa477_guias": {
    "label": "Multa 477 — pagou em dia, mas as guias/documentos atrasaram",
    "sub": "art.477 §6º inclui os documentos; há decisões contra"
   },
   "ri_doc": {
    "label": "Reconhecer rescisão indireta — atraso de salário / FGTS não depositado",
    "sub": "falta documental (extrato, holerite)"
   },
   "ri_verbas": {
    "label": "Reconhecer rescisão indireta — não pagava extras/adicionais",
    "sub": "depende de a tese principal ser provada"
   },
   "ri_conduta": {
    "label": "Reconhecer rescisão indireta — assédio/rigor, SEM testemunha",
    "sub": "ônus do cliente, sem prova = quase perda"
   },
   "ri_conduta_test": {
    "label": "Reconhecer rescisão indireta — assédio/rigor, COM testemunha",
    "sub": "testemunha prova a conduta"
   },
   "ri_reforco_test": {
    "label": "Reforço da testemunha na rescisão indireta documental (pontos)",
    "sub": ""
   },
   "vinc_admite": {
    "label": "Vínculo — empresa admite o trabalho (diz autônomo/PJ), SEM testemunha",
    "sub": "ônus da empresa provar a autonomia"
   },
   "vinc_admite_test": {
    "label": "Vínculo — empresa admite o trabalho, COM testemunha",
    "sub": "ônus da empresa + prova oral"
   },
   "vinc_nega_nada": {
    "label": "Vínculo — empresa nega, cliente sem prova",
    "sub": "ônus do cliente — quase perda"
   },
   "vinc_nega_doc": {
    "label": "Vínculo — empresa nega, cliente tem PIX/mensagens/crachá",
    "sub": "prova documental do trabalho"
   },
   "vinc_nega_test": {
    "label": "Vínculo — empresa nega, cliente tem testemunha",
    "sub": "prova oral"
   },
   "vinc_nega_doc_test": {
    "label": "Vínculo — empresa nega, cliente tem documento + testemunha",
    "sub": ""
   },
   "jc_sem_prova": {
    "label": "Reverter justa causa — empresa SEM advertência/prova, sem testemunha",
    "sub": "ônus da empresa provar a falta grave"
   },
   "jc_sem_prova_test": {
    "label": "Reverter justa causa — empresa SEM prova, COM testemunha",
    "sub": "ônus da empresa + prova oral do cliente"
   },
   "jc_com_prova": {
    "label": "Reverter justa causa — empresa COM advertência/prova, sem testemunha",
    "sub": "empresa cumpriu o ônus — quase perda"
   },
   "jc_com_prova_test": {
    "label": "Reverter justa causa — empresa COM prova, COM testemunha",
    "sub": "testemunha contradiz a versão da empresa"
   }
  }
 },
 "fgts": {
  "nome": "FGTS não depositado",
  "onus": "DEPÓSITO é fato extintivo → ônus da EMPRESA (Súm.461 TST)",
  "probs": {
   "com_extrato": {
    "label": "Extrato mostra meses sem depósito",
    "sub": "prova documental pronta"
   },
   "sem_extrato": {
    "label": "Sem extrato — empresa tem que provar o depósito",
    "sub": "ônus da empresa (Súm.461); não juntar extrato não derruba"
   }
  }
 },
 "equiparacao": {
  "nome": "Equiparação salarial",
  "onus": "Súm.6,VIII — cliente prova função igual; empresa prova fato impeditivo",
  "probs": {
   "paradigma_test": {
    "label": "Paradigma nomeado + testemunha",
    "sub": "prova mesma função"
   },
   "paradigma_sem_test": {
    "label": "Paradigma nomeado, sem testemunha",
    "sub": "depende de ficha/holerite"
   },
   "sem_paradigma": {
    "label": "Sem paradigma nomeado",
    "sub": "não há como provar — quase perda"
   }
  }
 },
 "por_fora": {
  "nome": "Salário por fora",
  "onus": "ônus do CLIENTE provar o pagamento fora da folha (fato constitutivo). PIX/extrato é prova pronta; dinheiro vivo depende de testemunha. O valor por fora também entra na base das horas extras",
  "probs": {
   "pix": {
    "label": "PIX / transferência",
    "sub": "extrato bancário prova"
   },
   "recibo": {
    "label": "Dinheiro com recibo/anotação da empresa",
    "sub": "documento da própria empresa"
   },
   "dinheiro_test": {
    "label": "Dinheiro em espécie, COM testemunha",
    "sub": "prova oral"
   },
   "dinheiro_sem": {
    "label": "Dinheiro em espécie, SEM testemunha",
    "sub": "ônus do cliente, sem prova = quase perda"
   }
  }
 },
 "acidente": {
  "nome": "Acidente de trabalho",
  "onus": "Nexo e tamanho do dano: PERÍCIA médica decide (testemunha reforça como aconteceu). Culpa: ônus do cliente, exceto atividade de risco (objetiva — Tema 932 STF); a empresa prova que cumpria as NRs (EPI, treinamento). Estabilidade (art.118 Lei 8.213): no acidente típico EXIGE afastamento de mais de 15 dias pelo INSS (Súm.378,II) — sem afastamento não há; com B91 é documental; com B31 (auxílio comum) converte em acidentário com CAT/SINAN/atestado. O Tema 125 (dispensa o afastamento) vale só para DOENÇA ocupacional. Pensão NÃO entra na comissão",
  "probs": {
   "dm_culpa": {
    "label": "Dano moral — falha da empresa apontada",
    "sub": "sem EPI, sem treinamento ou máquina sem proteção"
   },
   "dm_risco": {
    "label": "Dano moral — atividade de risco",
    "sub": "responsabilidade objetiva (Tema 932 STF): não precisa provar culpa"
   },
   "dm_sem_culpa": {
    "label": "Dano moral — sem falha apontada",
    "sub": "só o acidente, sem falha concreta da empresa"
   },
   "dm_trajeto": {
    "label": "Dano moral — trajeto",
    "sub": "sem culpa da empresa — quase perda"
   },
   "dm_trajeto_transp": {
    "label": "Dano moral — trajeto no transporte da empresa",
    "sub": "empresa responde como transportadora"
   },
   "sem_doc": {
    "label": "Sem CAT/atestado/laudo (pontos a menos)",
    "sub": "sem registro do acidente a prova fica fraca"
   },
   "reforco_test": {
    "label": "Reforço da testemunha (pontos)",
    "sub": "confirma como aconteceu e a falha da empresa"
   },
   "estab_b91": {
    "label": "Estabilidade — B91 e desligado no período",
    "sub": "documental (art.118 Lei 8.213)"
   },
   "estab_b31": {
    "label": "Estabilidade — INSS deu auxílio comum (B31), acidente provado",
    "sub": "converte em acidentário com CAT/SINAN/atestado (Súm.378,II)"
   },
   "estab_pedido": {
    "label": "Estabilidade — pediu a conta no período SEM sindicato",
    "sub": "art.500 CLT: pedido do estável sem sindicato é inválido"
   },
   "estab_pedido_sind": {
    "label": "Estabilidade — pediu a conta COM sindicato",
    "sub": "renúncia válida, salvo pressão provada"
   },
   "materiais": {
    "label": "Danos materiais (lucros cessantes / gastos)",
    "sub": "perícia + comprovantes; o INSS já pagou parte"
   }
  },
  "valores": {
   "dm_leve": {
    "label": "Dano moral — leve (planilha do escritório)"
   },
   "dm_medio": {
    "label": "Dano moral — média (planilha do escritório)"
   },
   "dm_grave": {
    "label": "Dano moral — grave (planilha do escritório)"
   },
   "materiais_sal": {
    "label": "Danos materiais (nº de salários — planilha)"
   }
  }
 },
 "doenca": {
  "nome": "Doença ocupacional",
  "onus": "Nexo (ou concausa) e incapacidade: PERÍCIA médica decide. B91 do INSS já reconhece o nexo. Doença da idade/degenerativa derruba a chance. Testemunha reforça as condições de trabalho. Estabilidade SEM afastamento do INSS vale se o nexo for reconhecido depois da saída (Tema 125 TST, vinculante) — indeniza os 12 meses. Pensão NÃO entra na comissão",
  "probs": {
   "dm_b91": {
    "label": "Dano moral — laudo/CID e INSS deu B91",
    "sub": "o INSS já reconheceu o nexo com o trabalho"
   },
   "dm_laudo": {
    "label": "Dano moral — laudo/CID, sem B91",
    "sub": "perícia decide nexo ou concausa"
   },
   "dm_sem_laudo": {
    "label": "Dano moral — sem laudo/CID",
    "sub": "sem diagnóstico — quase perda"
   },
   "degenerativa": {
    "label": "Pode ser da idade/degenerativa (pontos a menos)",
    "sub": "hérnia, artrose… a perícia tende a negar o nexo"
   },
   "reforco_test": {
    "label": "Reforço da testemunha (pontos)",
    "sub": "confirma ritmo, peso, postura, pressão"
   },
   "estab_b91": {
    "label": "Estabilidade — B91 e desligado no período",
    "sub": "documental (art.118 Lei 8.213)"
   },
   "estab_nexo_t125": {
    "label": "Estabilidade — sem B91, com laudo (Tema 125 TST)",
    "sub": "vinculante: dispensa afastamento se a perícia reconhecer o nexo depois da saída"
   },
   "estab_sem_laudo": {
    "label": "Estabilidade — sem B91 e sem laudo",
    "sub": "quase perda"
   },
   "estab_pedido": {
    "label": "Estabilidade — pediu a conta no período SEM sindicato",
    "sub": "art.500 CLT"
   },
   "estab_pedido_sind": {
    "label": "Estabilidade — pediu a conta COM sindicato",
    "sub": "renúncia válida, salvo pressão provada"
   },
   "materiais": {
    "label": "Danos materiais (lucros cessantes / gastos)",
    "sub": "perícia + comprovantes"
   }
  },
  "valores": {
   "dm_leve": {
    "label": "Dano moral — leve (planilha do escritório)"
   },
   "dm_medio": {
    "label": "Dano moral — média (planilha do escritório)"
   },
   "dm_grave": {
    "label": "Dano moral — grave (planilha do escritório)"
   },
   "materiais_sal": {
    "label": "Danos materiais (nº de salários — planilha)"
   }
  }
 },
 "gestante": {
  "nome": "Gestante (estabilidade)",
  "onus": "Da gravidez até 5 meses após o parto (ADCT art.10,II,b). Objetiva: a empresa não saber não importa (Súm.244,I; vale no aviso prévio — art.391-A). Contrato de EXPERIÊNCIA também tem (Tema 163 TST). Recusar voltar ao emprego NÃO tira a indenização (Tema 134 TST, Pleno 2025). Pediu a conta SEM sindicato = pedido inválido (art.500; TST SDI-1 2024). TEMPORÁRIA (Lei 6.019) é controversa: TST Pleno superou o IAC 2 em mar/2026 (14×11), modulação em aberto. A cliente prova que já estava grávida (exame)",
  "probs": {
   "dispensa": {
    "label": "Dispensada sem justa causa (inclui contrato de experiência)",
    "sub": "objetiva — Súm.244,I, art.391-A e Tema 163 TST (experiência)"
   },
   "temporaria_2026": {
    "label": "Temporária (agência, Lei 6.019) — controverso",
    "sub": "TST Pleno superou o IAC 2 em mar/2026 (14×11); modulação para casos anteriores em aberto"
   },
   "pedido_sem_sind": {
    "label": "Pediu a conta SEM o sindicato",
    "sub": "art.500 CLT — pedido inválido"
   },
   "pedido_com_sind": {
    "label": "Pediu a conta COM o sindicato",
    "sub": "só com pressão provada"
   },
   "pedido_com_sind_test": {
    "label": "Pediu a conta COM o sindicato + testemunha da pressão",
    "sub": "vício de consentimento"
   },
   "sem_exame": {
    "label": "Teto sem exame que mostre a gravidez antes da saída",
    "sub": "ônus da cliente provar que já estava grávida"
   },
   "dm": {
    "label": "Dano moral da gestante",
    "sub": "sai sozinho se o caso tiver a tese de dano moral (regra D11)"
   }
  },
  "valores": {
   "dm": {
    "label": "Dano moral da gestante"
   }
  }
 },
 "dano_moral": {
  "nome": "Dano moral",
  "onus": "ônus INTEGRAL do cliente provar fato e nexo. Cada situação é um pedido com valor próprio (somam). Com testemunha (topo) todas entram; sem testemunha, só as que têm documento",
  "probs": {
   "reforco_doc_test": {
    "label": "Documento + testemunha (pontos)",
    "sub": "as duas provas juntas reforçam a situação"
   }
  },
  "situacoes": {
   "assedio": {
    "label": "Assédio moral (ofensas, humilhação)"
   },
   "sexual": {
    "label": "Assédio sexual / discriminação"
   },
   "sem_banheiro": {
    "label": "Sem banheiro (trabalho externo)"
   },
   "restricao_banheiro": {
    "label": "Restrição ao uso do banheiro"
   },
   "refeicao": {
    "label": "Sem local adequado para refeição"
   },
   "degradante": {
    "label": "Condições degradantes (higiene, pragas)"
   },
   "atraso": {
    "label": "Atraso reiterado de salário/FGTS/rescisórias"
   },
   "jc_improbidade": {
    "label": "Justa causa por acusação de furto/desonestidade"
   },
   "informalidade": {
    "label": "Informalidade total (sem registro)"
   }
  }
 }
};
