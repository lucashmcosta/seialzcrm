// src/tipos.ts
var AVISOS_BLOQUEANTES = ["MARQUE OS AGENTES", "MARQUE AS SITUA\xC7\xD5ES", "INFORME A DIFEREN\xC7A"];

// src/catalogo.ts
var CATALOGO = {
  "horas_extras": {
    "nome": "Horas extras",
    "probs": {
      "forte_sem_ponto": {
        "label": "21+ func, sem ponto, sem testemunha",
        "sub": "\xF4nus da empresa (S\xFAm.338,I)"
      },
      "forte_sem_ponto_test": {
        "label": "21+ func, sem ponto, COM testemunha",
        "sub": "\xF4nus da empresa + prova oral"
      },
      "sem_ponto_peq": {
        "label": "Sem ponto, at\xE9 20 func, SEM testemunha",
        "sub": "sem obriga\xE7\xE3o legal \u2192 \xF4nus do cliente, sem prova = quase perda"
      },
      "sem_ponto_peq_test": {
        "label": "Sem ponto, at\xE9 20 func, COM testemunha",
        "sub": "sem obriga\xE7\xE3o, mas prova oral supre"
      },
      "ponto_real_nao_pagou": {
        "label": "Ponto real, extras N\xC3O pagas",
        "sub": "factual \u2014 o pr\xF3prio ponto prova o d\xE9bito"
      },
      "fraude_sem_test": {
        "label": "Ponto N\xC3O mostra o real, SEM testemunha",
        "sub": "alega fraude mas \xF4nus \xE9 do cliente \u2014 quase perda"
      },
      "fraude_com_test": {
        "label": "Ponto N\xC3O mostra o real, COM testemunha",
        "sub": "testemunha derruba o ponto falso"
      },
      "externo_sem_test": {
        "label": "Externo sem ponto, SEM testemunha",
        "sub": "art.62,I: sem obriga\xE7\xE3o de controle \u2192 \xF4nus do cliente, sem prova = quase perda"
      },
      "externo_test": {
        "label": "Externo sem ponto, COM testemunha",
        "sub": "testemunha \xE9 a prova do cliente"
      }
    }
  },
  "intrajornada": {
    "nome": "Intervalo de almo\xE7o",
    "onus": "INTERNO 21+ func sem registro: concess\xE3o \xE9 fato extintivo \u2192 \xF4nus da empresa. AT\xC9 20 func (sem obriga\xE7\xE3o de ponto) ou EXTERNO (art.62): \xF4nus do cliente, testemunha decide",
    "probs": {
      "pre_sem_test": {
        "label": "Ponto marca 1h mas n\xE3o tirava, SEM testemunha",
        "sub": "pr\xE9-assinala\xE7\xE3o vale como prova da empresa \u2192 \xF4nus do cliente derrubar, sem prova = quase perda"
      },
      "pre_test": {
        "label": "Ponto marca 1h mas n\xE3o tirava, COM testemunha",
        "sub": "testemunha derruba a pr\xE9-assinala\xE7\xE3o"
      },
      "ponto_real_suprimido": {
        "label": "Ponto registra intervalo suprimido (<1h)",
        "sub": "o pr\xF3prio ponto prova a supress\xE3o (S\xFAm.437)"
      },
      "interno_sem_reg_test": {
        "label": "Interno 21+ func, sem registro, COM testemunha",
        "sub": "\xF4nus da empresa + refor\xE7o"
      },
      "interno_sem_reg": {
        "label": "Interno 21+ func, sem registro, SEM testemunha",
        "sub": "obrigada a registrar (art.74 \xA72\xBA) \u2192 \xF4nus da empresa"
      },
      "peq_sem_reg_test": {
        "label": "At\xE9 20 func, sem registro, COM testemunha",
        "sub": "sem obriga\xE7\xE3o de ponto, mas a testemunha prova"
      },
      "peq_sem_reg": {
        "label": "At\xE9 20 func, sem registro, SEM testemunha",
        "sub": "sem obriga\xE7\xE3o de ponto \u2192 \xF4nus do cliente, sem prova = quase perda"
      },
      "externo_test": {
        "label": "Externo, COM testemunha",
        "sub": "\xF4nus do cliente, testemunha \xE9 a prova"
      },
      "externo_sem_test": {
        "label": "Externo, SEM testemunha",
        "sub": "art.62: \xF4nus do cliente, sem prova = quase perda"
      }
    }
  },
  "noturno": {
    "nome": "Adicional noturno",
    "onus": "Se pagava algo, o trabalho noturno \xE9 incontroverso. Se n\xE3o pagava, decide quem prova o hor\xE1rio ap\xF3s 22h: ponto real = prova pronta; 21+ func sem ponto = \xF4nus da empresa; ponto falso, at\xE9 20 func sem ponto ou externo = \xF4nus do cliente (testemunha decide)",
    "probs": {
      "ponto_real": {
        "label": "Ponto registra o hor\xE1rio ap\xF3s 22h e n\xE3o pagava",
        "sub": "factual \u2014 o pr\xF3prio ponto prova"
      },
      "grande_sem_ponto": {
        "label": "Sem ponto, 21+ func, SEM testemunha",
        "sub": "\xF4nus da empresa (S\xFAm.338,I)"
      },
      "grande_sem_ponto_test": {
        "label": "Sem ponto, 21+ func, COM testemunha",
        "sub": "\xF4nus da empresa + prova oral"
      },
      "peq_sem_ponto": {
        "label": "Sem ponto, at\xE9 20 func, SEM testemunha",
        "sub": "sem obriga\xE7\xE3o de controle \u2192 \xF4nus do cliente, sem prova"
      },
      "peq_sem_ponto_test": {
        "label": "Sem ponto, at\xE9 20 func, COM testemunha",
        "sub": "testemunha prova o hor\xE1rio"
      },
      "fraude_sem_test": {
        "label": "Ponto N\xC3O mostra o hor\xE1rio real, SEM testemunha",
        "sub": "\xF4nus do cliente derrubar o ponto \u2014 quase perda"
      },
      "fraude_com_test": {
        "label": "Ponto N\xC3O mostra o hor\xE1rio real, COM testemunha",
        "sub": "testemunha derruba o ponto"
      },
      "externo_sem_test": {
        "label": "Externo sem ponto, SEM testemunha",
        "sub": "art.62: \xF4nus do cliente, sem prova = quase perda"
      },
      "externo_test": {
        "label": "Externo sem ponto, COM testemunha",
        "sub": "testemunha prova o hor\xE1rio"
      },
      "pagou_a_menor": {
        "label": "Pagava, mas sem hora reduzida",
        "sub": "trabalho noturno incontroverso \u2014 cobra a diferen\xE7a"
      }
    }
  },
  "insalubridade": {
    "nome": "Insalubridade",
    "onus": "resolve por PER\xCDCIA (art.195); a testemunha refor\xE7a (confirma exposi\xE7\xE3o habitual e EPI n\xE3o entregue/n\xE3o usado). Cada agente tem anexo, grau e efeito do EPI pr\xF3prios",
    "probs": {
      "reforco_test": {
        "label": "Refor\xE7o da testemunha (pontos)",
        "sub": "confirma a exposi\xE7\xE3o e o EPI n\xE3o usado/fiscalizado (S\xFAm.289)"
      },
      "ja_recebe": {
        "label": "Recebe grau menor que o devido",
        "sub": "cobra s\xF3 a diferen\xE7a de grau (item 237)"
      },
      "agravante": {
        "label": "Refor\xE7o por agente adicional (pontos)",
        "sub": "cada agente a mais que se enquadra soma na chance"
      }
    },
    "agentes": {
      "biologico": {
        "label": "Biol\xF3gico",
        "sub": "Anexo 14 \u2014 hospital, esgoto, lixo urbano",
        "epi": "luva/m\xE1scara/avental"
      },
      "frio": {
        "label": "Frio",
        "sub": "Anexo 9 \u2014 c\xE2mara fria, frigor\xEDfico",
        "epi": "roupa t\xE9rmica/japona"
      },
      "calor": {
        "label": "Calor",
        "sub": "Anexo 3 \u2014 depende da medi\xE7\xE3o IBUTG (forno, fundi\xE7\xE3o, cozinha industrial)",
        "epi": "vestimenta de prote\xE7\xE3o t\xE9rmica"
      },
      "quimico": {
        "label": "Qu\xEDmico",
        "sub": "Anexos 11/13 \u2014 grau varia conforme o produto",
        "epi": "luva/respirador"
      },
      "umidade": {
        "label": "Umidade",
        "sub": "Anexo 10 \u2014 trabalho encharcado",
        "epi": "bota/avental imperme\xE1vel"
      },
      "ruido": {
        "label": "Ru\xEDdo",
        "sub": "Anexo 1 \u2014 s\xF3 acima do limite (~85 dB); protetor auricular costuma neutralizar",
        "epi": "protetor auricular",
        "fora": "ru\xEDdo moderado/intermitente"
      },
      "poeira": {
        "label": "Poeira",
        "sub": "Anexo 12 \u2014 s\xF3 poeira mineral (s\xEDlica, amianto, mangan\xEAs); poeira comum n\xE3o enquadra",
        "epi": "m\xE1scara PFF2/respirador",
        "fora": "poeira comum (madeira, farinha, terra)"
      }
    }
  },
  "periculosidade": {
    "nome": "Periculosidade",
    "onus": "resolve por PER\xCDCIA (art.195) \u2014 enquadramento mais objetivo; a testemunha refor\xE7a (confirma a atividade e a habitualidade)",
    "probs": {
      "reforco_test": {
        "label": "Refor\xE7o da testemunha (pontos)",
        "sub": "confirma a atividade de risco e a habitualidade"
      },
      "enquadra_claro": {
        "label": "Atividade claramente enquadrada (NR-16)",
        "sub": "eletricidade, inflam\xE1vel/GLP, vigil\xE2ncia, motocicleta (art.193 \xA74\xBA)"
      },
      "enquadra_duvidoso": {
        "label": "Enquadramento discut\xEDvel",
        "sub": "depende do laudo"
      },
      "ja_recebe": {
        "label": "Recebe sobre base errada",
        "sub": "cobra s\xF3 a diferen\xE7a de base \u2014 holerite prova"
      }
    }
  },
  "verbas_rescisorias": {
    "nome": "Verbas rescis\xF3rias",
    "onus": "\xF4nus da EMPRESA provar o pagamento (documental). MULTA 477: prazo de 10 dias para pagar E entregar os documentos (\xA76\xBA). JUSTA CAUSA: \xF4nus da EMPRESA provar a falta grave. RESCIS\xC3O INDIRETA: \xF4nus do CLIENTE provar a falta da empresa. SEM REGISTRO: se a empresa nega o trabalho, \xF4nus do cliente; se admite e diz que era aut\xF4nomo/PJ, \xF4nus da empresa \u2014 e sem v\xEDnculo NENHUMA tese existe. Essas chances valem para todas as teses afetadas. Seguro-desemprego N\xC3O entra no valor (decis\xE3o comercial)",
    "probs": {
      "documental": {
        "label": "N\xE3o pagas \u2014 empresa tem que provar quita\xE7\xE3o",
        "sub": "TRCT/recibo"
      },
      "multa477_guias": {
        "label": "Multa 477 \u2014 pagou em dia, mas as guias/documentos atrasaram",
        "sub": "art.477 \xA76\xBA inclui os documentos; h\xE1 decis\xF5es contra"
      },
      "ri_doc": {
        "label": "Reconhecer rescis\xE3o indireta \u2014 atraso de sal\xE1rio / FGTS n\xE3o depositado",
        "sub": "falta documental (extrato, holerite)"
      },
      "ri_verbas": {
        "label": "Reconhecer rescis\xE3o indireta \u2014 n\xE3o pagava extras/adicionais",
        "sub": "depende de a tese principal ser provada"
      },
      "ri_conduta": {
        "label": "Reconhecer rescis\xE3o indireta \u2014 ass\xE9dio/rigor, SEM testemunha",
        "sub": "\xF4nus do cliente, sem prova = quase perda"
      },
      "ri_conduta_test": {
        "label": "Reconhecer rescis\xE3o indireta \u2014 ass\xE9dio/rigor, COM testemunha",
        "sub": "testemunha prova a conduta"
      },
      "ri_reforco_test": {
        "label": "Refor\xE7o da testemunha na rescis\xE3o indireta documental (pontos)",
        "sub": ""
      },
      "vinc_admite": {
        "label": "V\xEDnculo \u2014 empresa admite o trabalho (diz aut\xF4nomo/PJ), SEM testemunha",
        "sub": "\xF4nus da empresa provar a autonomia"
      },
      "vinc_admite_test": {
        "label": "V\xEDnculo \u2014 empresa admite o trabalho, COM testemunha",
        "sub": "\xF4nus da empresa + prova oral"
      },
      "vinc_nega_nada": {
        "label": "V\xEDnculo \u2014 empresa nega, cliente sem prova",
        "sub": "\xF4nus do cliente \u2014 quase perda"
      },
      "vinc_nega_doc": {
        "label": "V\xEDnculo \u2014 empresa nega, cliente tem PIX/mensagens/crach\xE1",
        "sub": "prova documental do trabalho"
      },
      "vinc_nega_test": {
        "label": "V\xEDnculo \u2014 empresa nega, cliente tem testemunha",
        "sub": "prova oral"
      },
      "vinc_nega_doc_test": {
        "label": "V\xEDnculo \u2014 empresa nega, cliente tem documento + testemunha",
        "sub": ""
      },
      "jc_sem_prova": {
        "label": "Reverter justa causa \u2014 empresa SEM advert\xEAncia/prova, sem testemunha",
        "sub": "\xF4nus da empresa provar a falta grave"
      },
      "jc_sem_prova_test": {
        "label": "Reverter justa causa \u2014 empresa SEM prova, COM testemunha",
        "sub": "\xF4nus da empresa + prova oral do cliente"
      },
      "jc_com_prova": {
        "label": "Reverter justa causa \u2014 empresa COM advert\xEAncia/prova, sem testemunha",
        "sub": "empresa cumpriu o \xF4nus \u2014 quase perda"
      },
      "jc_com_prova_test": {
        "label": "Reverter justa causa \u2014 empresa COM prova, COM testemunha",
        "sub": "testemunha contradiz a vers\xE3o da empresa"
      }
    }
  },
  "fgts": {
    "nome": "FGTS n\xE3o depositado",
    "onus": "DEP\xD3SITO \xE9 fato extintivo \u2192 \xF4nus da EMPRESA (S\xFAm.461 TST)",
    "probs": {
      "com_extrato": {
        "label": "Extrato mostra meses sem dep\xF3sito",
        "sub": "prova documental pronta"
      },
      "sem_extrato": {
        "label": "Sem extrato \u2014 empresa tem que provar o dep\xF3sito",
        "sub": "\xF4nus da empresa (S\xFAm.461); n\xE3o juntar extrato n\xE3o derruba"
      }
    }
  },
  "equiparacao": {
    "nome": "Equipara\xE7\xE3o salarial",
    "onus": "S\xFAm.6,VIII \u2014 cliente prova fun\xE7\xE3o igual; empresa prova fato impeditivo",
    "probs": {
      "paradigma_test": {
        "label": "Paradigma nomeado + testemunha",
        "sub": "prova mesma fun\xE7\xE3o"
      },
      "paradigma_sem_test": {
        "label": "Paradigma nomeado, sem testemunha",
        "sub": "depende de ficha/holerite"
      },
      "sem_paradigma": {
        "label": "Sem paradigma nomeado",
        "sub": "n\xE3o h\xE1 como provar \u2014 quase perda"
      }
    }
  },
  "por_fora": {
    "nome": "Sal\xE1rio por fora",
    "onus": "\xF4nus do CLIENTE provar o pagamento fora da folha (fato constitutivo). PIX/extrato \xE9 prova pronta; dinheiro vivo depende de testemunha. O valor por fora tamb\xE9m entra na base das horas extras",
    "probs": {
      "pix": {
        "label": "PIX / transfer\xEAncia",
        "sub": "extrato banc\xE1rio prova"
      },
      "recibo": {
        "label": "Dinheiro com recibo/anota\xE7\xE3o da empresa",
        "sub": "documento da pr\xF3pria empresa"
      },
      "dinheiro_test": {
        "label": "Dinheiro em esp\xE9cie, COM testemunha",
        "sub": "prova oral"
      },
      "dinheiro_sem": {
        "label": "Dinheiro em esp\xE9cie, SEM testemunha",
        "sub": "\xF4nus do cliente, sem prova = quase perda"
      }
    }
  },
  "acidente": {
    "nome": "Acidente de trabalho",
    "onus": "Nexo e tamanho do dano: PER\xCDCIA m\xE9dica decide (testemunha refor\xE7a como aconteceu). Culpa: \xF4nus do cliente, exceto atividade de risco (objetiva \u2014 Tema 932 STF); a empresa prova que cumpria as NRs (EPI, treinamento). Estabilidade (art.118 Lei 8.213): no acidente t\xEDpico EXIGE afastamento de mais de 15 dias pelo INSS (S\xFAm.378,II) \u2014 sem afastamento n\xE3o h\xE1; com B91 \xE9 documental; com B31 (aux\xEDlio comum) converte em acident\xE1rio com CAT/SINAN/atestado. O Tema 125 (dispensa o afastamento) vale s\xF3 para DOEN\xC7A ocupacional. Pens\xE3o N\xC3O entra na comiss\xE3o",
    "probs": {
      "dm_culpa": {
        "label": "Dano moral \u2014 falha da empresa apontada",
        "sub": "sem EPI, sem treinamento ou m\xE1quina sem prote\xE7\xE3o"
      },
      "dm_risco": {
        "label": "Dano moral \u2014 atividade de risco",
        "sub": "responsabilidade objetiva (Tema 932 STF): n\xE3o precisa provar culpa"
      },
      "dm_sem_culpa": {
        "label": "Dano moral \u2014 sem falha apontada",
        "sub": "s\xF3 o acidente, sem falha concreta da empresa"
      },
      "dm_trajeto": {
        "label": "Dano moral \u2014 trajeto",
        "sub": "sem culpa da empresa \u2014 quase perda"
      },
      "dm_trajeto_transp": {
        "label": "Dano moral \u2014 trajeto no transporte da empresa",
        "sub": "empresa responde como transportadora"
      },
      "sem_doc": {
        "label": "Sem CAT/atestado/laudo (pontos a menos)",
        "sub": "sem registro do acidente a prova fica fraca"
      },
      "reforco_test": {
        "label": "Refor\xE7o da testemunha (pontos)",
        "sub": "confirma como aconteceu e a falha da empresa"
      },
      "estab_b91": {
        "label": "Estabilidade \u2014 B91 e desligado no per\xEDodo",
        "sub": "documental (art.118 Lei 8.213)"
      },
      "estab_b31": {
        "label": "Estabilidade \u2014 INSS deu aux\xEDlio comum (B31), acidente provado",
        "sub": "converte em acident\xE1rio com CAT/SINAN/atestado (S\xFAm.378,II)"
      },
      "estab_pedido": {
        "label": "Estabilidade \u2014 pediu a conta no per\xEDodo SEM sindicato",
        "sub": "art.500 CLT: pedido do est\xE1vel sem sindicato \xE9 inv\xE1lido"
      },
      "estab_pedido_sind": {
        "label": "Estabilidade \u2014 pediu a conta COM sindicato",
        "sub": "ren\xFAncia v\xE1lida, salvo press\xE3o provada"
      },
      "materiais": {
        "label": "Danos materiais (lucros cessantes / gastos)",
        "sub": "per\xEDcia + comprovantes; o INSS j\xE1 pagou parte"
      }
    },
    "valores": {
      "dm_leve": {
        "label": "Dano moral \u2014 leve (planilha do escrit\xF3rio)"
      },
      "dm_medio": {
        "label": "Dano moral \u2014 m\xE9dia (planilha do escrit\xF3rio)"
      },
      "dm_grave": {
        "label": "Dano moral \u2014 grave (planilha do escrit\xF3rio)"
      },
      "materiais_sal": {
        "label": "Danos materiais (n\xBA de sal\xE1rios \u2014 planilha)"
      }
    }
  },
  "doenca": {
    "nome": "Doen\xE7a ocupacional",
    "onus": "Nexo (ou concausa) e incapacidade: PER\xCDCIA m\xE9dica decide. B91 do INSS j\xE1 reconhece o nexo. Doen\xE7a da idade/degenerativa derruba a chance. Testemunha refor\xE7a as condi\xE7\xF5es de trabalho. Estabilidade SEM afastamento do INSS vale se o nexo for reconhecido depois da sa\xEDda (Tema 125 TST, vinculante) \u2014 indeniza os 12 meses. Pens\xE3o N\xC3O entra na comiss\xE3o",
    "probs": {
      "dm_b91": {
        "label": "Dano moral \u2014 laudo/CID e INSS deu B91",
        "sub": "o INSS j\xE1 reconheceu o nexo com o trabalho"
      },
      "dm_laudo": {
        "label": "Dano moral \u2014 laudo/CID, sem B91",
        "sub": "per\xEDcia decide nexo ou concausa"
      },
      "dm_sem_laudo": {
        "label": "Dano moral \u2014 sem laudo/CID",
        "sub": "sem diagn\xF3stico \u2014 quase perda"
      },
      "degenerativa": {
        "label": "Pode ser da idade/degenerativa (pontos a menos)",
        "sub": "h\xE9rnia, artrose\u2026 a per\xEDcia tende a negar o nexo"
      },
      "reforco_test": {
        "label": "Refor\xE7o da testemunha (pontos)",
        "sub": "confirma ritmo, peso, postura, press\xE3o"
      },
      "estab_b91": {
        "label": "Estabilidade \u2014 B91 e desligado no per\xEDodo",
        "sub": "documental (art.118 Lei 8.213)"
      },
      "estab_nexo_t125": {
        "label": "Estabilidade \u2014 sem B91, com laudo (Tema 125 TST)",
        "sub": "vinculante: dispensa afastamento se a per\xEDcia reconhecer o nexo depois da sa\xEDda"
      },
      "estab_sem_laudo": {
        "label": "Estabilidade \u2014 sem B91 e sem laudo",
        "sub": "quase perda"
      },
      "estab_pedido": {
        "label": "Estabilidade \u2014 pediu a conta no per\xEDodo SEM sindicato",
        "sub": "art.500 CLT"
      },
      "estab_pedido_sind": {
        "label": "Estabilidade \u2014 pediu a conta COM sindicato",
        "sub": "ren\xFAncia v\xE1lida, salvo press\xE3o provada"
      },
      "materiais": {
        "label": "Danos materiais (lucros cessantes / gastos)",
        "sub": "per\xEDcia + comprovantes"
      }
    },
    "valores": {
      "dm_leve": {
        "label": "Dano moral \u2014 leve (planilha do escrit\xF3rio)"
      },
      "dm_medio": {
        "label": "Dano moral \u2014 m\xE9dia (planilha do escrit\xF3rio)"
      },
      "dm_grave": {
        "label": "Dano moral \u2014 grave (planilha do escrit\xF3rio)"
      },
      "materiais_sal": {
        "label": "Danos materiais (n\xBA de sal\xE1rios \u2014 planilha)"
      }
    }
  },
  "gestante": {
    "nome": "Gestante (estabilidade)",
    "onus": "Da gravidez at\xE9 5 meses ap\xF3s o parto (ADCT art.10,II,b). Objetiva: a empresa n\xE3o saber n\xE3o importa (S\xFAm.244,I; vale no aviso pr\xE9vio \u2014 art.391-A). Contrato de EXPERI\xCANCIA tamb\xE9m tem (Tema 163 TST). Recusar voltar ao emprego N\xC3O tira a indeniza\xE7\xE3o (Tema 134 TST, Pleno 2025). Pediu a conta SEM sindicato = pedido inv\xE1lido (art.500; TST SDI-1 2024). TEMPOR\xC1RIA (Lei 6.019) \xE9 controversa: TST Pleno superou o IAC 2 em mar/2026 (14\xD711), modula\xE7\xE3o em aberto. A cliente prova que j\xE1 estava gr\xE1vida (exame)",
    "probs": {
      "dispensa": {
        "label": "Dispensada sem justa causa (inclui contrato de experi\xEAncia)",
        "sub": "objetiva \u2014 S\xFAm.244,I, art.391-A e Tema 163 TST (experi\xEAncia)"
      },
      "temporaria_2026": {
        "label": "Tempor\xE1ria (ag\xEAncia, Lei 6.019) \u2014 controverso",
        "sub": "TST Pleno superou o IAC 2 em mar/2026 (14\xD711); modula\xE7\xE3o para casos anteriores em aberto"
      },
      "pedido_sem_sind": {
        "label": "Pediu a conta SEM o sindicato",
        "sub": "art.500 CLT \u2014 pedido inv\xE1lido"
      },
      "pedido_com_sind": {
        "label": "Pediu a conta COM o sindicato",
        "sub": "s\xF3 com press\xE3o provada"
      },
      "pedido_com_sind_test": {
        "label": "Pediu a conta COM o sindicato + testemunha da press\xE3o",
        "sub": "v\xEDcio de consentimento"
      },
      "sem_exame": {
        "label": "Teto sem exame que mostre a gravidez antes da sa\xEDda",
        "sub": "\xF4nus da cliente provar que j\xE1 estava gr\xE1vida"
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
    "onus": "\xF4nus INTEGRAL do cliente provar fato e nexo. Cada situa\xE7\xE3o \xE9 um pedido com valor pr\xF3prio (somam). Com testemunha (topo) todas entram; sem testemunha, s\xF3 as que t\xEAm documento",
    "probs": {
      "reforco_doc_test": {
        "label": "Documento + testemunha (pontos)",
        "sub": "as duas provas juntas refor\xE7am a situa\xE7\xE3o"
      }
    },
    "situacoes": {
      "assedio": {
        "label": "Ass\xE9dio moral (ofensas, humilha\xE7\xE3o)"
      },
      "sexual": {
        "label": "Ass\xE9dio sexual / discrimina\xE7\xE3o"
      },
      "sem_banheiro": {
        "label": "Sem banheiro (trabalho externo)"
      },
      "restricao_banheiro": {
        "label": "Restri\xE7\xE3o ao uso do banheiro"
      },
      "refeicao": {
        "label": "Sem local adequado para refei\xE7\xE3o"
      },
      "degradante": {
        "label": "Condi\xE7\xF5es degradantes (higiene, pragas)"
      },
      "atraso": {
        "label": "Atraso reiterado de sal\xE1rio/FGTS/rescis\xF3rias"
      },
      "jc_improbidade": {
        "label": "Justa causa por acusa\xE7\xE3o de furto/desonestidade"
      },
      "informalidade": {
        "label": "Informalidade total (sem registro)"
      }
    }
  }
};

// src/motor.ts
var MOTOR_VERSAO = "1.0.0";
var FAIXAS = ["PRATA", "OURO", "TITANIO", "DIAMANTE"];
var num = (v, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};
function contexto(e, cal) {
  const s = num(e.salario) || 0;
  const ativas = new Set(e.teses);
  const pfRaw = (e.respostas.por_fora ?? {}).pf_valor ?? 500;
  const pf = ativas.has("por_fora") && e.saida !== "sem_registro" ? num(pfRaw) || 0 : 0;
  const meses = num(e.meses) || 0;
  return {
    sal: s,
    pf,
    m: Math.min(meses, 60),
    func: num(e.funcionarios) || 0,
    sh: (s + pf) / 220,
    vd: s / 30,
    dm: (num(e.diasSemana) || 5) * 4.33,
    saida: e.saida,
    meses,
    local: e.local ?? "interno",
    test: !!e.testemunha,
    e,
    cal,
    ativas
  };
}
var tc = (C, t) => C.cal[t];
var pp = (C, t, k) => {
  const v = tc(C, t).probs[k];
  if (v === void 0) throw new Error(`calibra\xE7\xE3o sem ${t}.probs.${k}`);
  return v / 100;
};
var pv = (C, t, k) => {
  const v = tc(C, t).valores?.[k];
  if (v === void 0) throw new Error(`calibra\xE7\xE3o sem ${t}.valores.${k}`);
  return v;
};
var defPonto = (C, padrao) => C.local === "externo" ? "nao_havia" : padrao;
var reforca = (p, pts) => Math.min(0.92, p + pts);
var lim01 = (p) => Math.max(0.03, Math.min(0.92, p));
var razao = (a, b) => b > 0 ? a / b : a > 0 ? 1 : 0;
var ehJC = (C) => C.saida === "justa_causa";
var pRev = (C) => pp(
  C,
  "verbas_rescisorias",
  C.e.jcEmpresaTemProva ? C.test ? "jc_com_prova_test" : "jc_com_prova" : C.test ? "jc_sem_prova_test" : "jc_sem_prova"
);
var temMulta40 = (C) => C.saida === "sem_justa_causa" || C.saida === "sem_registro";
var pRI = (C) => {
  const f = C.e.riFalta ?? "doc", R = (k) => pp(C, "verbas_rescisorias", k);
  if (f === "conduta") return C.test ? R("ri_conduta_test") : R("ri_conduta");
  return Math.min(0.92, (f === "verbas" ? R("ri_verbas") : R("ri_doc")) + (C.test ? R("ri_reforco_test") : 0));
};
var pVinc = (C) => {
  const R = (k) => pp(C, "verbas_rescisorias", k), adm = !!C.e.vinculoEmpresaAdmite, doc = !!C.e.vinculoTemProva;
  if (adm) return C.test ? R("vinc_admite_test") : R("vinc_admite");
  return doc && C.test ? R("vinc_nega_doc_test") : doc ? R("vinc_nega_doc") : C.test ? R("vinc_nega_test") : R("vinc_nega_nada");
};
var REFL_ESTAB = 1 + 1 / 12 + 1 / 12 * (4 / 3) + 0.08 * 1.4;
var mesesSemDeposito = (C) => !C.ativas.has("fgts") ? 0 : C.saida === "sem_registro" ? C.m : Math.max(0, Math.min(num((C.e.respostas.fgts ?? {}).fgts_meses ?? 12), C.m));
var somaPartes = (parts) => {
  const br = parts.reduce((s, p) => s + p[1], 0);
  return [br, br > 0 ? parts.reduce((s, p) => s + p[1] * p[2], 0) / br : 0];
};
var brl = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
var detPartes = (parts) => parts.map((p) => `${p[0]} ${brl(p[1])} (${Math.round(p[2] * 100)}%)`).join(" \xB7 ");
var GRAV = { leve: "leve", medio: "m\xE9dia", grave: "grave" };
var arr = (v) => Array.isArray(v) ? v : [];
function calcularTese(t, C) {
  const r = C.e.respostas[t] ?? {};
  const g = (k, d) => r[k] !== void 0 ? r[k] : d;
  const G = C.cal._geral;
  const reflexo = G.reflexo, sm = G.sm;
  let bruto = 0, prob = 0.5, det = "", aviso = "";
  if (t === "horas_extras") {
    bruto = C.sh * 1.5 * num(g("he_dia", 2)) * C.dm * C.m * reflexo;
    const ponto = g("he_ponto", defPonto(C, "relogio")), real = g("he_real", "sim") === "sim", temPonto = ponto !== "nao_havia";
    if (!temPonto && C.local === "externo") {
      prob = C.test ? pp(C, t, "externo_test") : pp(C, t, "externo_sem_test");
      det = C.test ? "externo sem ponto: \xF4nus do cliente, testemunha \xE9 a prova" : "externo sem ponto (art.62,I): \xF4nus do cliente, SEM testemunha = quase perda";
    } else if (!temPonto) {
      if (C.func > 20) {
        prob = C.test ? pp(C, t, "forte_sem_ponto_test") : pp(C, t, "forte_sem_ponto");
        det = C.test ? "sem ponto 21+ func + testemunha" : "sem ponto 21+ func: \xF4nus da empresa";
      } else {
        prob = C.test ? pp(C, t, "sem_ponto_peq_test") : pp(C, t, "sem_ponto_peq");
        det = C.test ? "sem ponto at\xE9 20 func + testemunha" : "sem ponto at\xE9 20 func";
      }
    } else if (real) {
      const pg = g("he_pagou", "nao");
      if (pg === "sim") {
        bruto = 0;
        prob = 0;
        det = "extras do ponto pagas corretamente: nada a cobrar";
      } else {
        if (pg === "parte") bruto *= 0.5;
        prob = pp(C, t, "ponto_real_nao_pagou");
        det = pg === "parte" ? "pagou s\xF3 parte: cobra o saldo \u2014 o ponto prova" : "ponto real e extras N\xC3O pagas: factual, o ponto prova";
      }
    } else {
      prob = C.test ? pp(C, t, "fraude_com_test") : pp(C, t, "fraude_sem_test");
      det = C.test ? "fraude no ponto: testemunha derruba" : "fraude no ponto SEM testemunha: \xF4nus do cliente, quase perda";
    }
  } else if (t === "intrajornada") {
    const min = num(g("intra_min", 30));
    bruto = min < 60 ? (60 - min) / 60 * C.sh * 1.5 * C.dm * C.m : 0;
    const reg = g("intra_registro", "nao");
    if (reg === "pre") {
      prob = C.test ? pp(C, t, "pre_test") : pp(C, t, "pre_sem_test");
      det = C.test ? "ponto marca 1h mas n\xE3o tirava: testemunha derruba a pr\xE9-assinala\xE7\xE3o" : "ponto marca 1h, SEM testemunha: \xF4nus do cliente, quase perda";
    } else if (reg === "sim_suprimido") {
      prob = pp(C, t, "ponto_real_suprimido");
      det = "ponto registra a supress\xE3o \u2014 prova pronta (S\xFAm.437)";
    } else if (C.local === "externo") {
      prob = C.test ? pp(C, t, "externo_test") : pp(C, t, "externo_sem_test");
      det = C.test ? "externo: \xF4nus do cliente, testemunha \xE9 a prova" : "externo (art.62): \xF4nus do cliente, SEM testemunha = quase perda";
    } else if (C.func > 20) {
      prob = C.test ? pp(C, t, "interno_sem_reg_test") : pp(C, t, "interno_sem_reg");
      det = C.test ? "21+ func sem registro: \xF4nus da empresa + testemunha" : "21+ func sem registro: \xF4nus da empresa provar a concess\xE3o";
    } else {
      prob = C.test ? pp(C, t, "peq_sem_reg_test") : pp(C, t, "peq_sem_reg");
      det = C.test ? "at\xE9 20 func sem registro: testemunha prova a supress\xE3o" : "at\xE9 20 func sem registro, SEM testemunha: \xF4nus do cliente, quase perda";
    }
  } else if (t === "noturno") {
    bruto = num(g("not_h", 2)) * C.sh * 0.2 * C.dm * C.m * reflexo;
    const sit = g("not_sit", "nao_pagou");
    if (sit === "pagou") {
      bruto = 0;
      prob = 0;
      det = "adicional pago corretamente: nada a cobrar";
    } else if (sit === "a_menor") {
      bruto = num(g("not_h", 2)) * (1 / 7) * C.sh * 1.2 * C.dm * C.m * reflexo;
      prob = pp(C, t, "pagou_a_menor");
      det = "pagava sem hora reduzida: cobra s\xF3 a diferen\xE7a (art.73 \xA71\xBA)";
    } else {
      const pt = g("not_ponto", defPonto(C, "real"));
      if (pt === "real") {
        prob = pp(C, t, "ponto_real");
        det = "ponto registra o hor\xE1rio noturno e n\xE3o pagava: factual";
      } else if (C.local === "externo") {
        prob = C.test ? pp(C, t, "externo_test") : pp(C, t, "externo_sem_test");
        det = C.test ? "externo: \xF4nus do cliente, testemunha prova o hor\xE1rio" : "externo (art.62): \xF4nus do cliente, SEM testemunha = quase perda";
      } else if (pt === "fraude") {
        prob = C.test ? pp(C, t, "fraude_com_test") : pp(C, t, "fraude_sem_test");
        det = C.test ? "ponto n\xE3o mostra o real: testemunha derruba" : "ponto n\xE3o mostra o real SEM testemunha: \xF4nus do cliente, quase perda";
      } else if (C.func > 20) {
        prob = C.test ? pp(C, t, "grande_sem_ponto_test") : pp(C, t, "grande_sem_ponto");
        det = "sem ponto, 21+ func: \xF4nus da empresa (S\xFAm.338,I)" + (C.test ? " + testemunha" : "");
      } else {
        prob = C.test ? pp(C, t, "peq_sem_ponto_test") : pp(C, t, "peq_sem_ponto");
        det = C.test ? "sem ponto, at\xE9 20 func: testemunha prova o hor\xE1rio" : "sem ponto, at\xE9 20 func, SEM testemunha: \xF4nus do cliente, sem prova";
      }
    }
  } else if (t === "insalubridade") {
    const A = tc(C, t).agentes, CA = CATALOGO.insalubridade.agentes;
    const ags = g("ins_agentes", []);
    const lst = (Array.isArray(ags) ? ags : ags ? [ags] : []).filter((a) => A[a]);
    if (!lst.length) {
      bruto = 0;
      prob = 0;
      aviso = "MARQUE OS AGENTES";
      det = "marque os agentes de exposi\xE7\xE3o";
    } else if (g("ins_recebe", "nao") === "sim") {
      const grauMax = Math.max(...lst.map((a) => A[a].grau));
      const gr = { i10: 0.1, i20: 0.2, i40: 0.4 }[g("ins_grau_recebe", "i20")];
      const dif = Math.max(0, grauMax - gr);
      bruto = dif * sm * C.m * reflexo;
      prob = dif > 0 ? pp(C, t, "ja_recebe") : 0;
      if (dif > 0 && C.test) prob = reforca(prob, pp(C, t, "reforco_test"));
      det = dif > 0 ? `recebe ${Math.round(gr * 100)}%, devido ${Math.round(grauMax * 100)}%: cobra s\xF3 a diferen\xE7a${C.test ? " \xB7 + testemunha" : ""}` : "j\xE1 recebe o grau devido: nada a cobrar";
    } else {
      const epiAgs = arr(g("ins_epi_ags", []));
      const comEpi = (a) => epiAgs.includes(a);
      const foraDoCaso = (a) => a === "ruido" && g("ins_ruido_nivel", "alto") === "moderado" || a === "poeira" && g("ins_poeira_tipo", "mineral") === "comum";
      const pAg = (a) => {
        const x = A[a];
        let p = foraDoCaso(a) ? x.prob_fora ?? x.prob : x.prob;
        if (comEpi(a)) p = Math.min(p, x.prob_epi);
        return p / 100;
      };
      const princ = lst.reduce((best, a) => A[a].grau * pAg(a) > A[best].grau * pAg(best) ? a : best, lst[0]);
      bruto = A[princ].grau * sm * C.m * reflexo;
      prob = pAg(princ);
      const extras = lst.filter((a) => a !== princ && pAg(a) >= 0.3).length;
      if (extras) prob = Math.min(0.92, prob + pp(C, t, "agravante") * extras);
      if (C.test) prob = reforca(prob, pp(C, t, "reforco_test"));
      det = `principal: ${CA[princ].label} ${Math.round(A[princ].grau * 100)}%${extras ? ` \xB7 +${extras} agravante(s)` : ""}${comEpi(princ) ? " \xB7 " + CA[princ].epi + " c/ ficha reduz" : ""}${foraDoCaso(princ) ? " \xB7 " + CA[princ].fora + ": n\xE3o enquadra" : ""}${C.test ? " \xB7 + testemunha" : ""}`;
    }
  } else if (t === "periculosidade") {
    bruto = 0.3 * C.sal * C.m * reflexo;
    const ats = g("per_ativs", []);
    const lst = Array.isArray(ats) ? ats : ats ? [ats] : [];
    const rec = g("per_recebe", "nao");
    if (rec === "sim") {
      bruto = 0;
      prob = 0;
      det = "j\xE1 recebe os 30%: nada a cobrar (periculosidade n\xE3o tem grau)";
    } else if (rec === "base") {
      bruto = 0.3 * num(g("per_dif_base", 300)) * C.m * reflexo;
      prob = pp(C, t, "ja_recebe");
      det = "recebe sobre base errada: cobra s\xF3 os 30% sobre o que ficou fora da base";
    } else {
      const claros = ["eletricidade", "inflamavel", "vigilancia", "moto", "explosivo", "radiacao"];
      const temClaro = lst.some((a) => claros.includes(a));
      prob = temClaro ? pp(C, t, "enquadra_claro") : pp(C, t, "enquadra_duvidoso");
      if (lst.length > 1) prob = Math.min(0.92, prob + 0.04 * (lst.length - 1));
      if (C.test) prob = reforca(prob, pp(C, t, "reforco_test"));
      det = `${lst.length || 1} atividade(s)${lst.length > 1 ? " \xB7 agravantes" : ""} (NR-16 / art.193 \xA74\xBA)${C.test ? " \xB7 + testemunha" : ""}`;
    }
  } else if (t === "verbas_rescisorias") {
    const rk = g("resc", "nada");
    const resc = { nada: 1, parcial: 0.5, tudo: 0 }[rk];
    const anos = Math.floor(C.meses / 12);
    const mFer = C.meses % 12, aniv = C.meses > 0 && mFer === 0;
    let nVenc = { sim: 0, ultimo: 1, dois: 2 }[g("ferias_venc", "sim")] ?? 0;
    if (aniv) nVenc = Math.max(nVenc, 1);
    nVenc = Math.min(nVenc, Math.floor(C.meses / 12));
    const fatorVenc = nVenc >= 1 ? 1 + (nVenc - 1) * 2 : 0;
    const mSemDep = mesesSemDeposito(C), doc = pp(C, t, "documental"), S = C.saida;
    const saldo = C.vd * 15, dec = C.sal * 0.5, ferProp = C.sal * (mFer / 12) * (4 / 3), ferVenc = C.sal * fatorVenc * (4 / 3);
    const aviso_ = C.vd * Math.min(30 + 3 * anos, 90), multa40 = 0.4 * 0.08 * C.sal * Math.max(0, C.meses - mSemDep);
    const p477 = rk !== "tudo" ? doc : { sim: 0, atrasou: doc, guias: pp(C, t, "multa477_guias") }[g("prazo477", "sim")] ?? 0;
    const parts = [];
    let cab = "";
    if (S === "justa_causa") {
      const pr = pRev(C);
      parts.push(
        ["devidas mesmo com justa causa (saldo, f\xE9rias vencidas)", resc * (saldo + ferVenc), doc],
        ["multa 477", C.sal, p477],
        ["se reverter (aviso, 13\xBA e f\xE9rias proporcionais, multa 40%)", aviso_ + dec + ferProp + multa40, pr]
      );
      cab = `justa causa \u2014 reverter ${Math.round(pr * 100)}% (${C.e.jcEmpresaTemProva ? "empresa tem prova" : "empresa sem prova"}${C.test ? " + testemunha" : ""})`;
    } else if (S === "rescisao_indireta") {
      const pr = pRI(C);
      parts.push(
        ["devidas de qualquer jeito (saldo, 13\xBA, f\xE9rias)", resc * (saldo + dec + ferProp + ferVenc), doc],
        ["se reconhecer (aviso, multa 40%, multa 477)", aviso_ + multa40 + C.sal, pr]
      );
      cab = `rescis\xE3o indireta \u2014 reconhecer ${Math.round(pr * 100)}%`;
    } else if (S === "pedido_demissao") {
      parts.push(["saldo, 13\xBA e f\xE9rias", resc * (saldo + dec + ferProp + ferVenc), doc], ["multa 477", C.sal, p477]);
      cab = "pedido de demiss\xE3o: sem aviso e sem multa de 40%";
    } else if (S === "sem_registro" && g("sr_13ferias", "nao") === "nao") {
      const nP = Math.floor(Math.max(0, C.m - mFer) / 12), fv = nP >= 1 ? 1 + (nP - 1) * 2 : 0;
      parts.push(
        ["saldo e aviso", saldo + aviso_, doc],
        [`13\xBA de todo o per\xEDodo (${C.m} meses)`, C.sal * C.m / 12, doc],
        [`f\xE9rias de todo o per\xEDodo (${nP} per\xEDodo(s)${nP > 1 ? `, ${nP - 1} em dobro` : ""}) + proporcionais`, C.sal * (fv + mFer / 12) * (4 / 3), doc],
        ["multa 40% FGTS", multa40, doc],
        ["multa 477 (S\xFAm.462)", C.sal, doc]
      );
      cab = "sem registro: 13\xBA e f\xE9rias de todo o per\xEDodo";
    } else {
      parts.push(
        ["saldo, aviso, 13\xBA e f\xE9rias", resc * (saldo + aviso_ + dec + ferProp + ferVenc), doc],
        ["multa 40% FGTS", resc * multa40, doc],
        ["multa 477", C.sal, S === "sem_registro" ? doc : p477]
      );
      cab = S === "sem_registro" ? "sem registro (recebia 13\xBA e f\xE9rias)" : "dispensa sem justa causa";
    }
    const ok = parts.filter((p) => p[1] > 0 && p[2] > 0);
    [bruto, prob] = somaPartes(ok);
    const srTodo = S === "sem_registro" && g("sr_13ferias", "nao") === "nao";
    det = !ok.length ? "pagou tudo e entregou as guias em at\xE9 10 dias: nada a cobrar" : srTodo ? `${cab} \xB7 ` + detPartes(ok) : `${cab} \xB7 f\xE9rias ${mFer}/12` + (nVenc ? ` + ${nVenc} per\xEDodo(s) n\xE3o tirado(s)${nVenc > 1 ? " (em dobro)" : ""}` : "") + " \xB7 " + detPartes(ok);
  } else if (t === "fgts") {
    const sr = C.saida === "sem_registro";
    const digitado = sr ? C.m : num(g("fgts_meses", 12)), mFgts = Math.max(0, Math.min(digitado, C.m));
    const ext = sr || g("fgts_extrato", "sim") === "sim", pf_ = ext ? pp(C, t, "com_extrato") : pp(C, t, "sem_extrato");
    const dep = 0.08 * C.sal * mFgts, parts = [["dep\xF3sitos 8%", dep, pf_]];
    if (temMulta40(C)) parts.push(["multa 40%", dep * 0.4, pf_]);
    else if (ehJC(C)) parts.push(["multa 40% (se reverter a justa causa)", dep * 0.4, Math.min(pf_, pRev(C))]);
    else if (C.saida === "rescisao_indireta") parts.push(["multa 40% (se reconhecer a rescis\xE3o indireta)", dep * 0.4, Math.min(pf_, pRI(C))]);
    [bruto, prob] = somaPartes(parts);
    det = (sr ? "sem registro: nada foi depositado" : ext ? "extrato prova" : "sem extrato") + ` \xB7 ${mFgts} meses` + (C.meses > mFgts && mFgts === 60 ? " (limitado a 60: prescri\xE7\xE3o)" : digitado > mFgts ? mFgts === 60 ? " (limitado a 60: prescri\xE7\xE3o)" : " (limitado ao v\xEDnculo)" : "") + " \xB7 " + detPartes(parts) + (C.saida === "pedido_demissao" ? " \xB7 pedido de demiss\xE3o: sem multa de 40%" : "");
  } else if (t === "equiparacao") {
    bruto = num(g("eq_dif", 0)) * C.m * reflexo;
    if (g("eq_paradigma", "nao") !== "sim") {
      prob = pp(C, t, "sem_paradigma");
      det = "n\xE3o sabe o nome do colega (paradigma): quase perda";
    } else {
      prob = C.test ? pp(C, t, "paradigma_test") : pp(C, t, "paradigma_sem_test");
      det = C.test ? "colega nomeado + testemunha" : "colega nomeado, sem testemunha";
    }
    if (!(num(g("eq_dif", 0)) > 0)) {
      aviso = "INFORME A DIFEREN\xC7A";
      det = "informe quanto o colega ganha a mais por m\xEAs";
    }
  } else if (t === "por_fora") {
    const v = num(g("pf_valor", 500)), f = g("pf_forma", "pix");
    if (C.saida === "sem_registro") {
      bruto = 0;
      prob = 0;
      aviso = "N\xC3O SE APLICA";
      det = 'sem registro: o sal\xE1rio inteiro j\xE1 \xE9 "por fora" e j\xE1 entra em FGTS, 13\xBA e f\xE9rias \u2014 informe o sal\xE1rio total no topo';
    } else {
      bruto = v * C.m * (1 / 12 + 1 / 12 * (4 / 3) + 0.08 * (temMulta40(C) ? 1.4 : 1));
      if (f === "pix") {
        prob = pp(C, t, "pix");
        det = "PIX/extrato: prova documental";
      } else if (f === "recibo") {
        prob = pp(C, t, "recibo");
        det = "recibo/anota\xE7\xE3o da pr\xF3pria empresa";
      } else {
        prob = C.test ? pp(C, t, "dinheiro_test") : pp(C, t, "dinheiro_sem");
        det = C.test ? "dinheiro + testemunha" : "dinheiro SEM testemunha: \xF4nus do cliente, sem prova";
      }
      det += " \xB7 cobra os reflexos (o valor em si j\xE1 foi pago) e entra na base das horas extras";
    }
  } else if (t === "acidente" || t === "doenca") {
    const ac = t === "acidente", P = (k) => pp(C, t, k), q = (k) => (ac ? "ac_" : "do_") + k;
    const grav = g(q("grav"), "leve"), inss = g(q("inss"), "nao"), parts = [];
    let pdm;
    if (ac) {
      if (g("ac_tipo", "tipico") === "trajeto") pdm = g("ac_transp", "nao") === "sim" ? P("dm_trajeto_transp") : P("dm_trajeto");
      else {
        const c = arr(g("ac_culpa", []));
        pdm = c.includes("risco") ? P("dm_risco") : c.length ? P("dm_culpa") : P("dm_sem_culpa");
      }
      if (g("ac_doc", "sim") === "nao") pdm -= P("sem_doc");
    } else {
      const laudo = g("do_laudo", "sim") === "sim";
      pdm = !laudo ? P("dm_sem_laudo") : inss === "b91" ? P("dm_b91") : P("dm_laudo");
      if (g("do_degen", "nao") === "sim") pdm -= P("degenerativa");
    }
    if (C.test) pdm += P("reforco_test");
    parts.push(["dano moral " + GRAV[grav], pv(C, t, "dm_" + grav), lim01(pdm)]);
    if (inss !== "nao" || grav === "grave")
      parts.push(["danos materiais", pv(C, t, "materiais_sal") * C.sal, lim01(P("materiais") + (C.test ? P("reforco_test") : 0) - (ac && g("ac_doc", "sim") === "nao" ? P("sem_doc") : 0))]);
    const afastou = inss !== "nao";
    if (g(q("estab"), "nao") === "sim" && (afastou || !ac)) {
      const mr = afastou ? Math.max(0, 12 - num(g(q("meses_volta"), 3))) : 12;
      let direito;
      if (inss === "b91") direito = 1;
      else if (ac) {
        direito = razao(P("estab_b31"), P("estab_b91"));
        if (g("ac_doc", "sim") === "nao") direito = Math.max(0, direito - P("sem_doc"));
      } else direito = razao(g("do_laudo", "sim") === "sim" ? P("estab_nexo_t125") : P("estab_sem_laudo"), P("estab_b91"));
      let pe;
      if (C.saida === "pedido_demissao") pe = (g(q("sind"), "nao") === "sim" ? P("estab_pedido_sind") : P("estab_pedido")) * Math.min(1, direito);
      else pe = P("estab_b91") * Math.min(1, direito);
      if (ehJC(C)) pe *= pRev(C);
      else if (C.saida === "rescisao_indireta") pe *= pRI(C);
      const motivo = inss === "b91" ? " (B91)" : ac ? " (B31: converter em acident\xE1rio)" : afastou ? " (B31: nexo por per\xEDcia)" : " (Tema 125: nexo depois da sa\xEDda)";
      if (mr > 0) parts.push([`estabilidade ${mr} meses${motivo}` + (ehJC(C) ? " (se reverter a justa causa)" : C.saida === "rescisao_indireta" ? " (se reconhecer a rescis\xE3o indireta)" : ""), C.sal * mr * REFL_ESTAB, lim01(pe)]);
    }
    [bruto, prob] = somaPartes(parts);
    det = detPartes(parts) + " \xB7 pens\xE3o n\xE3o entra";
  } else if (t === "gestante") {
    const P = (k) => pp(C, t, k), nasc = g("ge_momento", "gravida") === "nasceu";
    const mr = nasc ? Math.max(0, 5 - num(g("ge_meses_bebe", 1))) : Math.max(0, Math.min(14, 9 - num(g("ge_meses", 3)) + 5));
    const ct = g("ge_contrato", "normal");
    let pe, base_;
    const fatorCt = ct === "temporario" ? razao(P("temporaria_2026"), P("dispensa")) : 1;
    const ctTxt = ct === "temporario" ? ` \xB7 tempor\xE1ria: controverso (${Math.round(P("temporaria_2026") * 100)}%)` : ct === "experiencia" ? " \xB7 experi\xEAncia: tem estabilidade (Tema 163)" : "";
    if (C.saida === "pedido_demissao") {
      const sind = g("ge_sind", "nao") === "sim";
      pe = (sind ? C.test ? P("pedido_com_sind_test") : P("pedido_com_sind") : P("pedido_sem_sind")) * fatorCt;
      base_ = sind ? "pediu a conta COM sindicato" + (C.test ? " + testemunha da press\xE3o" : "") : "pediu a conta SEM sindicato: pedido inv\xE1lido (art.500)";
    } else if (C.saida === "rescisao_indireta") {
      const pr = pRI(C);
      pe = P("dispensa") * pr * fatorCt;
      base_ = `rescis\xE3o indireta: s\xF3 se reconhecer (${Math.round(pr * 100)}%)`;
    } else if (ehJC(C)) {
      const pr = pRev(C);
      pe = P("dispensa") * pr * fatorCt;
      base_ = `justa causa: s\xF3 se reverter (${Math.round(pr * 100)}%)`;
    } else {
      pe = P("dispensa") * fatorCt;
      base_ = "dispensada: estabilidade objetiva";
    }
    base_ += ctTxt;
    if (!nasc && g("ge_exame", "sim") === "nao") {
      pe = Math.min(pe, P("sem_exame"));
      base_ += " \xB7 sem exame";
    }
    pe = lim01(pe);
    if (mr <= 0) {
      bruto = 0;
      prob = 0;
      aviso = "FORA DA ESTABILIDADE";
      det = "saiu depois dos 5 meses ap\xF3s o parto: n\xE3o h\xE1 estabilidade";
    } else {
      const parts = [[`indeniza\xE7\xE3o ${mr} meses`, C.sal * mr * REFL_ESTAB, pe]];
      if (C.saida === "pedido_demissao") {
        const anos = Math.floor(C.meses / 12);
        parts.push(["convers\xE3o em dispensa (aviso + multa 40%)", C.vd * Math.min(30 + 3 * anos, 90) + 0.4 * 0.08 * C.sal * Math.max(0, C.meses - mesesSemDeposito(C)), pe]);
      }
      if (!C.ativas.has("dano_moral")) parts.push(["dano moral", pv(C, t, "dm"), Math.min(pe, P("dm"))]);
      [bruto, prob] = somaPartes(parts);
      det = base_ + " \xB7 " + detPartes(parts) + (C.ativas.has("dano_moral") ? " \xB7 dano moral fica na tese de dano moral (D11)" : "");
    }
  } else if (t === "dano_moral") {
    const S = tc(C, t).situacoes;
    const sits = arr(g("dano_sits", [])).filter((k) => S[k]);
    const provas = arr(g("dano_provas", []));
    const comDoc = (k) => provas.includes(k);
    const naoAplica = sits.filter((k) => k === "jc_improbidade" && !ehJC(C)).length;
    const autoProva = (k) => k === "informalidade" && C.saida === "sem_registro";
    const comProva = sits.filter((k) => (C.test || comDoc(k) || autoProva(k)) && !(k === "jc_improbidade" && !ehJC(C)));
    const semProva = sits.length - comProva.length - naoAplica;
    const pSit = (k) => {
      let p = Math.min(0.95, S[k].prob / 100 + (C.test && comDoc(k) ? pp(C, t, "reforco_doc_test") : 0));
      if (k === "jc_improbidade") p = Math.min(p, pRev(C));
      return p;
    };
    if (!sits.length) {
      bruto = 0;
      prob = 0;
      aviso = "MARQUE AS SITUA\xC7\xD5ES";
      det = "marque as situa\xE7\xF5es de dano";
    } else if (!comProva.length && naoAplica === sits.length) {
      bruto = 0;
      prob = 0;
      aviso = "S\xD3 COM JUSTA CAUSA";
      det = "acusa\xE7\xE3o de furto/desonestidade s\xF3 vale se a sa\xEDda foi por justa causa";
    } else if (!comProva.length) {
      bruto = 0;
      prob = 0;
      aviso = "SEM PROVA";
      det = "sem testemunha e sem documento: nenhuma situa\xE7\xE3o entra (\xF4nus do cliente)";
    } else {
      bruto = comProva.reduce((s, k) => s + S[k].valor, 0);
      prob = bruto > 0 ? comProva.reduce((s, k) => s + S[k].valor * pSit(k), 0) / bruto : 0;
      const nDocTest = C.test ? comProva.filter(comDoc).length : 0;
      det = `${comProva.length} situa\xE7\xE3o(\xF5es) somam` + (C.test ? " (testemunha prova)" : comProva.every(autoProva) ? "" : " (com documento)") + (nDocTest ? ` \xB7 ${nDocTest} com documento + testemunha (refor\xE7o)` : "") + (semProva ? ` \xB7 ${semProva} sem documento n\xE3o entra(m)` : "") + (naoAplica ? " \xB7 acusa\xE7\xE3o de furto s\xF3 vale com justa causa" : "") + (comProva.some(autoProva) ? " \xB7 informalidade: provada junto com o v\xEDnculo" : "");
    }
  }
  if (C.saida === "sem_registro" && bruto > 0) {
    const pv_ = pVinc(C);
    prob *= pv_;
    det += ` \xB7 s\xF3 se reconhecer o v\xEDnculo (${Math.round(pv_ * 100)}%)`;
  }
  const probAuto = prob;
  const ov = C.e.ajusteManual?.[t];
  const temOv = ov !== void 0 && ov !== null;
  if (temOv) {
    prob = ov / 100;
    det = "ajuste manual (auto era " + Math.round(probAuto * 100) + "%)";
  }
  const selo = prob >= G.selo_forte / 100 ? "forte" : prob >= G.selo_media / 100 ? "media" : "fraca";
  return { tese: t, bruto, prob, probAuto, esperado: bruto * prob, selo, aviso, detalhe: det, ajusteManual: temOv };
}
function calcularCaso(e, cal) {
  const C = contexto(e, cal), F = cal._faixas;
  const ativas = [...C.ativas];
  let excluir = null;
  if (C.ativas.has("insalubridade") && C.ativas.has("periculosidade")) {
    const ri = calcularTese("insalubridade", C), rp = calcularTese("periculosidade", C);
    excluir = ri.bruto >= rp.bruto ? "periculosidade" : "insalubridade";
  }
  let veTot = 0, vbTot = 0, veW = 0, vbW = 0;
  const teses = ativas.map((t) => {
    const r = calcularTese(t, C), w = cal._pesos_tese?.[t] ?? 1, ex = t === excluir;
    const esp = ex ? 0 : r.esperado, bru = ex ? 0 : r.bruto;
    veTot += esp;
    vbTot += bru;
    veW += esp * w;
    vbW += bru * w;
    return { ...r, excluida: ex };
  });
  const solidez = vbW > 0 ? veW / vbW : 0;
  const score = Math.round(solidez * 100);
  const pTam = F.peso_tamanho / 100;
  const valorComposto = vbTot * (pTam + (1 - pTam) * solidez);
  const valorFaixa = F.base_faixa === "bruto" ? vbTot : F.base_faixa === "esperado" ? veTot : valorComposto;
  const fx = (v) => v > F.limites[2] ? 3 : v > F.limites[1] ? 2 : v > F.limites[0] ? 1 : 0;
  const faltaPreencher = teses.filter((r) => AVISOS_BLOQUEANTES.includes(r.aviso)).map((r) => ({ tese: r.tese, aviso: r.aviso }));
  if (!ativas.length) {
    return {
      motor: MOTOR_VERSAO,
      teses,
      faltaPreencher,
      brutoTotal: 0,
      esperadoTotal: 0,
      solidez: 0,
      score: 0,
      valorComposto: 0,
      valorFaixa: 0,
      faixaPorValor: null,
      ajusteScore: null,
      faixa: null,
      comissao: 0,
      emRevisao: false
    };
  }
  const baseN = fx(valorFaixa);
  const iBand = Math.min(9, Math.max(0, Math.floor(score / 10)));
  const band = F.score_faixas[iBand] ?? { mover_faixa: 0, pct_comissao: 100 };
  const nivel = Math.max(0, Math.min(3, baseN + band.mover_faixa));
  const comissao = Math.round(F.comissao[nivel] * band.pct_comissao / 100);
  return {
    motor: MOTOR_VERSAO,
    teses,
    faltaPreencher,
    brutoTotal: vbTot,
    esperadoTotal: veTot,
    solidez,
    score,
    valorComposto,
    valorFaixa,
    faixaPorValor: FAIXAS[baseN],
    ajusteScore: { faixaScore: iBand, mover: band.mover_faixa, pct: band.pct_comissao },
    faixa: FAIXAS[nivel],
    comissao,
    emRevisao: comissao === 0
  };
}

// src/perguntas.ts
var defPonto2 = (c, p) => c.local === "externo" ? "nao_havia" : p;
var lista = (v) => Array.isArray(v) ? v : [];
var CAT = CATALOGO;
var SAIDAS = [
  ["sem_justa_causa", "Dispensa sem justa causa"],
  ["rescisao_indireta", "Rescis\xE3o indireta"],
  ["pedido_demissao", "Pedido de demiss\xE3o (v\xEDcio)"],
  ["sem_registro", "Sem registro (v\xEDnculo)"],
  ["justa_causa", "Justa causa (reverter)"]
];
var SIM_NAO = [["nao", "N\xE3o"], ["sim", "Sim"]];
var PASSO_DADOS = [
  { campo: "salario", tipo: "num", rotulo: "Sal\xE1rio mensal", dica: "R$", validar: (v) => v > 0 ? "" : "Informe o sal\xE1rio." },
  { campo: "meses", tipo: "num", rotulo: "Meses de v\xEDnculo", validar: (v) => v > 0 ? "" : "Informe os meses de v\xEDnculo." },
  { campo: "funcionarios", tipo: "num", rotulo: "N\xBA de funcion\xE1rios", dica: "na empresa", validar: (v) => v > 0 ? "" : "Informe o n\xFAmero de funcion\xE1rios." },
  { campo: "diasSemana", tipo: "num", rotulo: "Dias trabalhados por semana", padrao: 5, validar: (v) => v >= 1 && v <= 7 ? "" : "Dias por semana: de 1 a 7." }
];
var PASSO_SAIDA = [
  { campo: "saida", tipo: "select", rotulo: "Como saiu", opcoes: SAIDAS, padrao: "sem_justa_causa" },
  {
    campo: "riFalta",
    tipo: "chip",
    rotulo: "Rescis\xE3o indireta: qual a principal falta da empresa?",
    dica: "o cliente prova",
    padrao: "doc",
    opcoes: [["doc", "Atraso de sal\xE1rio / FGTS n\xE3o depositado"], ["verbas", "N\xE3o pagava extras/adicionais"], ["conduta", "Ass\xE9dio, ofensas, rigor excessivo"]],
    cond: (e) => e.saida === "rescisao_indireta"
  },
  {
    campo: "vinculoEmpresaAdmite",
    tipo: "chip",
    rotulo: "Sem registro: a empresa admite que ele trabalhou l\xE1?",
    dica: "mesmo dizendo que era aut\xF4nomo/PJ",
    opcoes: [["nao", "N\xE3o, nega"], ["sim", "Sim, admite"]],
    padrao: "nao",
    cond: (e) => e.saida === "sem_registro",
    nota: "Sem registro: marcamos sozinho FGTS (todo o per\xEDodo), verbas rescis\xF3rias (13\xBA e f\xE9rias de todo o per\xEDodo) e dano moral por informalidade. Desmarque o que n\xE3o se aplicar."
  },
  {
    campo: "vinculoTemProva",
    tipo: "chip",
    rotulo: "Tem prova do trabalho?",
    dica: "PIX, mensagens, crach\xE1, fotos",
    opcoes: SIM_NAO,
    padrao: "nao",
    cond: (e) => e.saida === "sem_registro"
  },
  {
    campo: "jcEmpresaTemProva",
    tipo: "chip",
    rotulo: "Justa causa: a empresa tem advert\xEAncias, suspens\xF5es ou prova da falta?",
    dica: "o \xF4nus \xE9 dela",
    opcoes: SIM_NAO,
    padrao: "nao",
    cond: (e) => e.saida === "justa_causa"
  },
  { campo: "local", tipo: "chip", rotulo: "Trabalho", dica: "afeta jornada", opcoes: [["interno", "Interno"], ["externo", "Externo"]], padrao: "interno" },
  { campo: "testemunha", tipo: "chip", rotulo: "Testemunha do per\xEDodo?", dica: "refor\xE7a as teses", opcoes: SIM_NAO, padrao: "nao" }
];
var AUTO_SEM_REGISTRO = ["verbas_rescisorias", "fgts", "dano_moral"];
var AUTO_SEM_REGISTRO_SITUACAO = "informalidade";
var MENSAGEM_FALTA = {
  "MARQUE OS AGENTES": "Marque os agentes de exposi\xE7\xE3o.",
  "MARQUE AS SITUA\xC7\xD5ES": "Marque pelo menos uma situa\xE7\xE3o.",
  "INFORME A DIFEREN\xC7A": "Informe quanto o colega ganha a mais por m\xEAs."
};
var TITULOS_PASSO = {
  dados: ["Dados do contrato", "Informe o que o cliente contou sobre o emprego"],
  saida: ["Como terminou o contrato", "Sa\xEDda, tipo de trabalho e testemunha"],
  teses: ["Quais direitos o caso tem?", "Marque todas as teses que se aplicam"],
  tese: ["(nome da tese)", "Responda com o que o cliente informou"],
  revisao: ["Confira antes de finalizar", "Depois de finalizar n\xE3o d\xE1 para alterar"]
};
var NOME_TESE = Object.fromEntries(
  Object.entries(CAT).map(([k, v]) => [k, v.nome])
);
var PERGUNTAS = {
  horas_extras: [
    {
      id: "he_ponto",
      tipo: "select",
      rotulo: "Como marcava o ponto?",
      padrao: (c) => defPonto2(c, "relogio"),
      opcoes: [["relogio", "Rel\xF3gio/cart\xE3o"], ["app", "Aplicativo"], ["manual", "Folha manual"], ["nao_havia", "N\xE3o havia"]]
    },
    {
      id: "he_real",
      tipo: "chip",
      rotulo: "Ponto mostrava hor\xE1rio real?",
      opcoes: [["sim", "Sim"], ["nao", "N\xE3o/fixo"]],
      padrao: "sim",
      cond: (r, c) => (r.he_ponto ?? defPonto2(c, "relogio")) !== "nao_havia"
    },
    {
      id: "he_pagou",
      tipo: "chip",
      rotulo: "A empresa pagou as extras que o ponto registra?",
      opcoes: [["nao", "N\xE3o"], ["parte", "Parte"], ["sim", "Sim, todas"]],
      padrao: "nao",
      cond: (r, c) => r.he_real !== "nao" && (r.he_ponto ?? defPonto2(c, "relogio")) !== "nao_havia"
    },
    { id: "he_dia", tipo: "num", rotulo: "Horas extra/dia", padrao: 2 }
  ],
  intrajornada: [
    { id: "intra_min", tipo: "num", rotulo: "Minutos de almo\xE7o reais", padrao: 30 },
    {
      id: "intra_registro",
      tipo: "select",
      rotulo: "O que o ponto mostrava do intervalo?",
      padrao: "nao",
      opcoes: [["nao", "N\xE3o registrava / sem ponto"], ["pre", "Marcava 1h, mas na pr\xE1tica n\xE3o tirava (pr\xE9-assinalado)"], ["sim_suprimido", "Marcava menos de 1h (o pr\xF3prio ponto mostra)"]]
    }
  ],
  noturno: [
    { id: "not_h", tipo: "num", rotulo: "Horas ap\xF3s 22h/dia", padrao: 2 },
    {
      id: "not_sit",
      tipo: "select",
      rotulo: "Como era o adicional noturno?",
      padrao: "nao_pagou",
      opcoes: [["nao_pagou", "N\xE3o pagava"], ["a_menor", "Pagava a menor / sem hora reduzida"], ["pagou", "Pagava certo"]]
    },
    {
      id: "not_ponto",
      tipo: "select",
      rotulo: "O ponto registrava o hor\xE1rio depois das 22h?",
      padrao: (c) => defPonto2(c, "real"),
      opcoes: [["real", "Sim, marcava o hor\xE1rio real"], ["fraude", "N\xE3o \u2014 marcava sa\xEDda antes / hor\xE1rio fixo"], ["nao_havia", "N\xE3o havia controle de ponto"]],
      cond: (r) => (r.not_sit || "nao_pagou") === "nao_pagou"
    }
  ],
  insalubridade: [
    {
      id: "ins_agentes",
      tipo: "multi",
      rotulo: "Agentes (marque todos \u2014 s\xE3o agravantes)",
      padrao: [],
      opcoes: () => Object.entries(CAT.insalubridade.agentes).map(([k, a]) => [k, a.label])
    },
    {
      id: "ins_ruido_nivel",
      tipo: "chip",
      rotulo: "Como era o barulho?",
      padrao: "alto",
      opcoes: [["alto", "Alto o dia todo (precisava gritar pra conversar)"], ["moderado", "Moderado / de vez em quando"]],
      cond: (r) => lista(r.ins_agentes).includes("ruido")
    },
    {
      id: "ins_poeira_tipo",
      tipo: "chip",
      rotulo: "Que tipo de poeira?",
      padrao: "mineral",
      opcoes: [["mineral", "Mineral (s\xEDlica, cimento, amianto, carv\xE3o)"], ["comum", "Comum (madeira, farinha, terra)"]],
      cond: (r) => lista(r.ins_agentes).includes("poeira")
    },
    { id: "ins_recebe", tipo: "chip", rotulo: "J\xE1 recebe insalubridade?", opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]], padrao: "nao" },
    {
      id: "ins_grau_recebe",
      tipo: "chip",
      rotulo: "Qual grau recebe hoje?",
      opcoes: [["i10", "10%"], ["i20", "20%"], ["i40", "40%"]],
      padrao: "i20",
      cond: (r) => r.ins_recebe === "sim"
    },
    {
      id: "ins_epi_ags",
      tipo: "multi",
      rotulo: "Recebia EPI com ficha assinada? Marque os agentes em que recebia (deixe desmarcado se n\xE3o recebia)",
      padrao: [],
      opcoes: (r) => lista(r.ins_agentes).filter((a) => CAT.insalubridade.agentes[a]).map((a) => [a, CAT.insalubridade.agentes[a].label + " \u2014 " + CAT.insalubridade.agentes[a].epi]),
      cond: (r) => r.ins_recebe !== "sim" && lista(r.ins_agentes).length > 0
    }
  ],
  periculosidade: [
    {
      id: "per_ativs",
      tipo: "multi",
      rotulo: "Atividades perigosas (marque todas)",
      padrao: [],
      opcoes: [["eletricidade", "Eletricidade"], ["inflamavel", "Inflam\xE1vel/GLP"], ["vigilancia", "Vigil\xE2ncia"], ["moto", "Motocicleta"], ["explosivo", "Explosivos"], ["radiacao", "Radia\xE7\xE3o"]]
    },
    { id: "per_recebe", tipo: "chip", rotulo: "J\xE1 recebe periculosidade?", opcoes: [["nao", "N\xE3o"], ["sim", "Sim, 30% certo"], ["base", "Sim, base errada"]], padrao: "nao" },
    { id: "per_dif_base", tipo: "num", rotulo: "Valor mensal fora da base de c\xE1lculo (R$)", padrao: 300, cond: (r) => r.per_recebe === "base" }
  ],
  verbas_rescisorias: [
    {
      id: "resc",
      tipo: "chip",
      rotulo: "Recebeu a rescis\xE3o?",
      opcoes: [["nada", "Nada"], ["parcial", "Parte"], ["tudo", "Tudo"]],
      padrao: "nada",
      cond: (r, c) => c.saida !== "sem_registro"
    },
    {
      id: "prazo477",
      tipo: "chip",
      rotulo: "Pagou E entregou os documentos (guias) em at\xE9 10 dias?",
      padrao: "sim",
      opcoes: [["sim", "Sim, tudo em dia"], ["atrasou", "Pagou atrasado"], ["guias", "Pagou em dia, guias atrasaram"]],
      cond: (r, c) => (r.resc || "nada") === "tudo" && ["sem_justa_causa", "pedido_demissao", "justa_causa"].includes(c.saida)
    },
    {
      id: "sr_13ferias",
      tipo: "chip",
      rotulo: "Recebia 13\xBA e f\xE9rias mesmo sem registro?",
      opcoes: [["nao", "N\xE3o (o normal sem registro)"], ["sim", "Sim"]],
      padrao: "nao",
      cond: (r, c) => c.saida === "sem_registro"
    },
    {
      id: "ferias_venc",
      tipo: "chip",
      rotulo: "Tirou as f\xE9rias dos anos completos?",
      padrao: "sim",
      opcoes: [["sim", "Sim, tirou"], ["ultimo", "N\xE3o tirou a do \xFAltimo ano"], ["dois", "Ficou 2+ anos sem tirar"]],
      cond: (r, c) => c.meses >= 12 && (r.resc || "nada") !== "tudo"
    }
  ],
  fgts: [
    // sem registro: nada foi depositado — não pergunta, usa o período todo
    {
      id: "fgts_extrato",
      tipo: "chip",
      rotulo: "Extrato mostra meses sem dep\xF3sito?",
      opcoes: [["sim", "Sim"], ["nao", "N\xE3o/n\xE3o sabe"]],
      padrao: "sim",
      cond: (r, c) => c.saida !== "sem_registro"
    },
    { id: "fgts_meses", tipo: "num", rotulo: "Meses sem dep\xF3sito", padrao: 12, cond: (r, c) => c.saida !== "sem_registro" }
  ],
  equiparacao: [
    { id: "eq_paradigma", tipo: "chip", rotulo: "Sabe o nome de um funcion\xE1rio que ganha mais para a mesma fun\xE7\xE3o?", opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]], padrao: "nao" },
    { id: "eq_dif", tipo: "num", rotulo: "Quanto esse colega ganha a mais por m\xEAs (R$)", padrao: 0 }
  ],
  por_fora: [
    { id: "pf_valor", tipo: "num", rotulo: "Quanto recebia por fora (R$/m\xEAs)", padrao: 500 },
    {
      id: "pf_forma",
      tipo: "select",
      rotulo: "Como recebia?",
      padrao: "pix",
      opcoes: [["pix", "PIX / transfer\xEAncia (o extrato prova)"], ["recibo", "Dinheiro, com recibo ou anota\xE7\xE3o da empresa"], ["dinheiro", "Dinheiro em esp\xE9cie, sem comprovante"]]
    }
  ],
  acidente: [
    { id: "ac_tipo", tipo: "chip", rotulo: "Onde aconteceu?", opcoes: [["tipico", "No trabalho"], ["trajeto", "No trajeto casa\u2013trabalho"]], padrao: "tipico" },
    { id: "ac_grav", tipo: "chip", rotulo: "Gravidade", opcoes: [["leve", "Leve (sem sequela)"], ["medio", "M\xE9dia (afastou e recuperou)"], ["grave", "Grave (sequela permanente)"]], padrao: "leve" },
    {
      id: "ac_inss",
      tipo: "select",
      rotulo: "Afastou pelo INSS?",
      padrao: "nao",
      opcoes: [["nao", "N\xE3o afastou / menos de 15 dias"], ["b31", "Sim, aux\xEDlio comum (B31)"], ["b91", "Sim, aux\xEDlio acident\xE1rio (B91)"]]
    },
    { id: "ac_doc", tipo: "chip", rotulo: "Tem CAT, atestado, laudo ou registro do atendimento?", opcoes: [["sim", "Sim"], ["nao", "N\xE3o"]], padrao: "sim" },
    {
      id: "ac_culpa",
      tipo: "multi",
      rotulo: "O que se aplica? (marque tudo)",
      padrao: [],
      opcoes: [["epi", "N\xE3o dava EPI"], ["treino", "Sem treinamento"], ["maquina", "M\xE1quina sem prote\xE7\xE3o"], ["risco", "Atividade de risco (moto, eletricidade, altura\u2026)"]],
      cond: (r) => (r.ac_tipo || "tipico") === "tipico"
    },
    { id: "ac_transp", tipo: "chip", rotulo: "Ia no transporte da empresa?", opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]], padrao: "nao", cond: (r) => r.ac_tipo === "trajeto" },
    // estabilidade no acidente típico só existe se afastou mais de 15 dias pelo INSS (Súm.378,II)
    {
      id: "ac_estab",
      tipo: "chip",
      rotulo: "Foi desligado at\xE9 12 meses depois de voltar do INSS?",
      opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]],
      padrao: "nao",
      cond: (r) => (r.ac_inss || "nao") !== "nao"
    },
    {
      id: "ac_meses_volta",
      tipo: "num",
      rotulo: "Quantos meses depois de voltar foi desligado?",
      padrao: 3,
      cond: (r) => (r.ac_inss || "nao") !== "nao" && r.ac_estab === "sim"
    },
    {
      id: "ac_sind",
      tipo: "chip",
      rotulo: "Teve assist\xEAncia do sindicato no pedido de demiss\xE3o?",
      opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]],
      padrao: "nao",
      cond: (r, c) => (r.ac_inss || "nao") !== "nao" && r.ac_estab === "sim" && c.saida === "pedido_demissao"
    }
  ],
  doenca: [
    { id: "do_grav", tipo: "chip", rotulo: "Gravidade", opcoes: [["leve", "Leve (sem sequela)"], ["medio", "M\xE9dia (afastou e recuperou)"], ["grave", "Grave (sequela permanente)"]], padrao: "leve" },
    {
      id: "do_inss",
      tipo: "select",
      rotulo: "Afastou pelo INSS?",
      padrao: "nao",
      opcoes: [["nao", "N\xE3o afastou / menos de 15 dias"], ["b31", "Sim, aux\xEDlio comum (B31)"], ["b91", "Sim, aux\xEDlio acident\xE1rio (B91)"]]
    },
    { id: "do_laudo", tipo: "chip", rotulo: "Tem atestado ou laudo com CID (diagn\xF3stico)?", opcoes: [["sim", "Sim"], ["nao", "N\xE3o"]], padrao: "sim" },
    { id: "do_degen", tipo: "chip", rotulo: "Pode ser doen\xE7a da idade/degenerativa? (h\xE9rnia, artrose, bico de papagaio)", opcoes: [["nao", "N\xE3o"], ["sim", "Sim / talvez"]], padrao: "nao" },
    // sem afastamento, a estabilidade da doença vem do Tema 125 (nexo reconhecido depois da saída) e indeniza os 12 meses
    {
      id: "do_estab",
      tipo: "chip",
      opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]],
      padrao: "nao",
      rotulo: (r) => (r.do_inss || "nao") === "nao" ? "Foi desligado j\xE1 com a doen\xE7a? (sem afastamento \u2014 Tema 125)" : "Foi desligado at\xE9 12 meses depois de voltar do INSS?"
    },
    {
      id: "do_meses_volta",
      tipo: "num",
      rotulo: "Quantos meses depois de voltar foi desligado?",
      padrao: 3,
      cond: (r) => (r.do_inss || "nao") !== "nao" && r.do_estab === "sim"
    },
    {
      id: "do_sind",
      tipo: "chip",
      rotulo: "Teve assist\xEAncia do sindicato no pedido de demiss\xE3o?",
      opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]],
      padrao: "nao",
      cond: (r, c) => r.do_estab === "sim" && c.saida === "pedido_demissao"
    }
  ],
  gestante: [
    { id: "ge_momento", tipo: "chip", rotulo: "Na sa\xEDda\u2026", opcoes: [["gravida", "Estava gr\xE1vida"], ["nasceu", "O beb\xEA j\xE1 tinha nascido"]], padrao: "gravida" },
    { id: "ge_meses", tipo: "num", rotulo: "Meses de gravidez na sa\xEDda", padrao: 3, cond: (r) => (r.ge_momento || "gravida") === "gravida" },
    { id: "ge_meses_bebe", tipo: "num", rotulo: "Meses do beb\xEA na sa\xEDda", padrao: 1, cond: (r) => r.ge_momento === "nasceu" },
    {
      id: "ge_contrato",
      tipo: "select",
      rotulo: "Tipo de contrato",
      padrao: "normal",
      opcoes: [["normal", "Normal (prazo indeterminado)"], ["experiencia", "Contrato de experi\xEAncia (tem estabilidade \u2014 Tema 163)"], ["temporario", "Tempor\xE1ria (ag\xEAncia, Lei 6.019) \u2014 controverso"]]
    },
    {
      id: "ge_exame",
      tipo: "chip",
      rotulo: "Tem exame/ultrassom que mostra a gravidez antes da sa\xEDda?",
      opcoes: [["sim", "Sim"], ["nao", "N\xE3o"]],
      padrao: "sim",
      cond: (r) => (r.ge_momento || "gravida") === "gravida"
    },
    {
      id: "ge_sind",
      tipo: "chip",
      rotulo: "Teve assist\xEAncia do sindicato no pedido de demiss\xE3o?",
      opcoes: [["nao", "N\xE3o"], ["sim", "Sim"]],
      padrao: "nao",
      cond: (r, c) => c.saida === "pedido_demissao"
    }
  ],
  dano_moral: [
    {
      id: "dano_sits",
      tipo: "multi",
      rotulo: "Situa\xE7\xF5es (marque todas \u2014 cada uma \xE9 um pedido com valor pr\xF3prio)",
      padrao: [],
      opcoes: () => Object.entries(CAT.dano_moral.situacoes).map(([k, x]) => [k, x.label])
    },
    {
      id: "dano_provas",
      tipo: "multi",
      padrao: [],
      rotulo: (r, c) => c.testemunha ? "Quais tamb\xE9m t\xEAm documento? (mensagem, \xE1udio, foto) \u2014 com testemunha todas j\xE1 entram; documento refor\xE7a" : "Quais t\xEAm documento? (mensagem, \xE1udio, foto) \u2014 SEM testemunha, s\xF3 entra o que tem documento",
      opcoes: (r) => lista(r.dano_sits).filter((k) => CAT.dano_moral.situacoes[k]).map((k) => [k, CAT.dano_moral.situacoes[k].label]),
      cond: (r) => lista(r.dano_sits).length > 0
    }
  ]
};
var perguntasVisiveis = (t, r, c) => PERGUNTAS[t].filter((p) => !p.cond || p.cond(r, c));
function padraoDe(p, c) {
  if (typeof p.padrao === "function") return p.padrao(c);
  if (p.padrao !== void 0) return p.padrao;
  return p.tipo === "multi" ? [] : "";
}
function pendenciaDaTese(t, r = {}) {
  const comoLista = (v) => Array.isArray(v) ? v : v ? [String(v)] : [];
  const numero = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  if (t === "insalubridade" && !comoLista(r.ins_agentes).some((a) => CAT.insalubridade.agentes[a])) return MENSAGEM_FALTA["MARQUE OS AGENTES"];
  if (t === "dano_moral" && !comoLista(r.dano_sits).some((k) => CAT.dano_moral.situacoes[k])) return MENSAGEM_FALTA["MARQUE AS SITUA\xC7\xD5ES"];
  if (t === "equiparacao" && !(numero(r.eq_dif) > 0)) return MENSAGEM_FALTA["INFORME A DIFEREN\xC7A"];
  return "";
}

// src/calibracao-v1.ts
var CALIBRACAO_V1 = {
  "_versao": 2,
  "_motor": "1.0.0",
  "horas_extras": {
    "probs": {
      "forte_sem_ponto": 85,
      "forte_sem_ponto_test": 95,
      "sem_ponto_peq": 22,
      "sem_ponto_peq_test": 75,
      "ponto_real_nao_pagou": 90,
      "fraude_sem_test": 12,
      "fraude_com_test": 78,
      "externo_sem_test": 10,
      "externo_test": 70
    }
  },
  "intrajornada": {
    "probs": {
      "pre_sem_test": 12,
      "pre_test": 78,
      "ponto_real_suprimido": 90,
      "interno_sem_reg_test": 80,
      "interno_sem_reg": 65,
      "peq_sem_reg_test": 75,
      "peq_sem_reg": 22,
      "externo_test": 70,
      "externo_sem_test": 10
    }
  },
  "noturno": {
    "probs": {
      "ponto_real": 90,
      "grande_sem_ponto": 80,
      "grande_sem_ponto_test": 92,
      "peq_sem_ponto": 20,
      "peq_sem_ponto_test": 72,
      "fraude_sem_test": 12,
      "fraude_com_test": 75,
      "externo_sem_test": 15,
      "externo_test": 68,
      "pagou_a_menor": 78
    }
  },
  "insalubridade": {
    "probs": {
      "reforco_test": 6,
      "ja_recebe": 78,
      "agravante": 5
    },
    "agentes": {
      "biologico": {
        "grau": 0.4,
        "prob": 65,
        "prob_epi": 50
      },
      "frio": {
        "grau": 0.2,
        "prob": 65,
        "prob_epi": 35
      },
      "calor": {
        "grau": 0.2,
        "prob": 50,
        "prob_epi": 45
      },
      "quimico": {
        "grau": 0.2,
        "prob": 50,
        "prob_epi": 25
      },
      "umidade": {
        "grau": 0.2,
        "prob": 55,
        "prob_epi": 25
      },
      "ruido": {
        "grau": 0.2,
        "prob": 45,
        "prob_epi": 15,
        "prob_fora": 10
      },
      "poeira": {
        "grau": 0.2,
        "prob": 45,
        "prob_epi": 15,
        "prob_fora": 5
      }
    }
  },
  "periculosidade": {
    "probs": {
      "reforco_test": 6,
      "enquadra_claro": 72,
      "enquadra_duvidoso": 50,
      "ja_recebe": 80
    }
  },
  "verbas_rescisorias": {
    "probs": {
      "documental": 92,
      "multa477_guias": 70,
      "ri_doc": 85,
      "ri_verbas": 60,
      "ri_conduta": 20,
      "ri_conduta_test": 70,
      "ri_reforco_test": 5,
      "vinc_admite": 75,
      "vinc_admite_test": 85,
      "vinc_nega_nada": 10,
      "vinc_nega_doc": 60,
      "vinc_nega_test": 70,
      "vinc_nega_doc_test": 85,
      "jc_sem_prova": 70,
      "jc_sem_prova_test": 82,
      "jc_com_prova": 20,
      "jc_com_prova_test": 40
    }
  },
  "fgts": {
    "probs": {
      "com_extrato": 92,
      "sem_extrato": 70
    }
  },
  "equiparacao": {
    "probs": {
      "paradigma_test": 65,
      "paradigma_sem_test": 40,
      "sem_paradigma": 12
    }
  },
  "por_fora": {
    "probs": {
      "pix": 85,
      "recibo": 75,
      "dinheiro_test": 60,
      "dinheiro_sem": 15
    }
  },
  "acidente": {
    "probs": {
      "dm_culpa": 70,
      "dm_risco": 75,
      "dm_sem_culpa": 35,
      "dm_trajeto": 10,
      "dm_trajeto_transp": 60,
      "sem_doc": 25,
      "reforco_test": 8,
      "estab_b91": 88,
      "estab_b31": 65,
      "estab_pedido": 55,
      "estab_pedido_sind": 10,
      "materiais": 40
    },
    "valores": {
      "dm_leve": 2e4,
      "dm_medio": 3e4,
      "dm_grave": 5e4,
      "materiais_sal": 12
    }
  },
  "doenca": {
    "probs": {
      "dm_b91": 70,
      "dm_laudo": 50,
      "dm_sem_laudo": 20,
      "degenerativa": 25,
      "reforco_test": 6,
      "estab_b91": 85,
      "estab_nexo_t125": 50,
      "estab_sem_laudo": 15,
      "estab_pedido": 55,
      "estab_pedido_sind": 10,
      "materiais": 35
    },
    "valores": {
      "dm_leve": 2e4,
      "dm_medio": 3e4,
      "dm_grave": 5e4,
      "materiais_sal": 12
    }
  },
  "gestante": {
    "probs": {
      "dispensa": 90,
      "temporaria_2026": 55,
      "pedido_sem_sind": 80,
      "pedido_com_sind": 10,
      "pedido_com_sind_test": 30,
      "sem_exame": 30,
      "dm": 40
    },
    "valores": {
      "dm": 1e4
    }
  },
  "dano_moral": {
    "probs": {
      "reforco_doc_test": 10
    },
    "situacoes": {
      "assedio": {
        "valor": 2e4,
        "prob": 60
      },
      "sexual": {
        "valor": 25e3,
        "prob": 55
      },
      "sem_banheiro": {
        "valor": 15e3,
        "prob": 65
      },
      "restricao_banheiro": {
        "valor": 1e4,
        "prob": 55
      },
      "refeicao": {
        "valor": 18e3,
        "prob": 60
      },
      "degradante": {
        "valor": 18e3,
        "prob": 60
      },
      "atraso": {
        "valor": 1e4,
        "prob": 75
      },
      "jc_improbidade": {
        "valor": 1e4,
        "prob": 55
      },
      "informalidade": {
        "valor": 15e3,
        "prob": 60
      }
    }
  },
  "_faixas": {
    "limites": [
      4e4,
      9e4,
      2e5
    ],
    "comissao": [
      50,
      110,
      180,
      300
    ],
    "peso_tamanho": 40,
    "base_faixa": "composto",
    "score_faixas": [
      {
        "score": "0\u20139%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "10\u201319%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "20\u201329%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "30\u201339%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "40\u201349%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "50\u201359%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "60\u201369%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "70\u201379%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "80\u201389%",
        "mover_faixa": 0,
        "pct_comissao": 100
      },
      {
        "score": "90\u2013100%",
        "mover_faixa": 0,
        "pct_comissao": 100
      }
    ]
  },
  "_pesos_tese": {
    "horas_extras": 1,
    "intrajornada": 1,
    "noturno": 1,
    "insalubridade": 1,
    "periculosidade": 1,
    "verbas_rescisorias": 1,
    "fgts": 1,
    "equiparacao": 1,
    "por_fora": 1,
    "acidente": 1,
    "doenca": 1,
    "gestante": 1,
    "dano_moral": 1
  },
  "_geral": {
    "selo_forte": 65,
    "selo_media": 40,
    "sm": 1621,
    "reflexo": 1.37
  }
};

// src/calibracao.ts
var clone = (o) => JSON.parse(JSON.stringify(o));
var num2 = (v) => v !== null && v !== "" && v !== void 0 && Number.isFinite(Number(v));
var TESES = Object.keys(CATALOGO);
function mesclarCalibracao(importada, base = CALIBRACAO_V1) {
  if (!importada || typeof importada !== "object" || Array.isArray(importada)) throw new Error("formato inv\xE1lido");
  const o = importada, c = clone(base), ignorados = [];
  let aplicados = 0;
  for (const t of TESES) {
    const x = o[t], b = c[t];
    if (!x || typeof x !== "object") continue;
    for (const grupo of ["probs", "valores"]) if (x[grupo]) for (const k in x[grupo]) {
      if (b[grupo] && k in b[grupo] && num2(x[grupo][k])) {
        b[grupo][k] = +x[grupo][k];
        aplicados++;
      } else ignorados.push(`${t}.${grupo}.${k}`);
    }
    if (x.situacoes) for (const k in x.situacoes) {
      const s = b.situacoes?.[k], y = x.situacoes[k];
      if (s && y) {
        if (num2(y.valor)) s.valor = +y.valor;
        if (num2(y.prob)) s.prob = +y.prob;
        aplicados++;
      } else ignorados.push(`${t}.situacoes.${k}`);
    }
    if (x.agentes) for (const a in x.agentes) {
      const s = b.agentes?.[a], y = x.agentes[a];
      if (s && y) {
        for (const f2 of ["grau", "prob", "prob_epi", "prob_fora"]) if (s[f2] !== void 0 && num2(y[f2])) s[f2] = +y[f2];
        aplicados++;
      } else ignorados.push(`${t}.agentes.${a}`);
    }
  }
  if (o._pesos_tese) {
    for (const t in o._pesos_tese) if (TESES.includes(t) && num2(o._pesos_tese[t])) c._pesos_tese[t] = +o._pesos_tese[t];
  }
  const f = o._faixas || {};
  if (Array.isArray(f.limites)) f.limites.forEach((v, i) => {
    if (i < 3 && num2(v)) c._faixas.limites[i] = +v;
  });
  if (Array.isArray(f.comissao)) f.comissao.forEach((v, i) => {
    if (i < 4 && num2(v)) c._faixas.comissao[i] = +v;
  });
  if (num2(f.peso_tamanho)) c._faixas.peso_tamanho = +f.peso_tamanho;
  if (["composto", "bruto", "esperado"].includes(f.base_faixa)) c._faixas.base_faixa = f.base_faixa;
  if (Array.isArray(f.score_faixas)) f.score_faixas.forEach((b, i) => {
    if (i < 10 && b) {
      if (num2(b.mover_faixa)) c._faixas.score_faixas[i].mover_faixa = Math.max(-3, Math.min(2, Math.round(+b.mover_faixa)));
      if (num2(b.pct_comissao)) c._faixas.score_faixas[i].pct_comissao = Math.max(0, +b.pct_comissao);
    }
  });
  const g = o._geral || {};
  for (const k of ["selo_forte", "selo_media", "sm", "reflexo"]) if (num2(g[k])) c._geral[k] = +g[k];
  return { calibracao: c, aplicados, ignorados };
}
function conferirCalibracao(cal) {
  const p = [], c = cal;
  for (const t of TESES) {
    const x = c[t];
    if (!x?.probs) {
      p.push(`${t}: sem as chances`);
      continue;
    }
    for (const k in x.probs) if (!num2(x.probs[k]) || x.probs[k] < 0 || x.probs[k] > 100) p.push(`${t}.${k}: chance precisa ficar entre 0 e 100`);
    for (const k in x.valores ?? {}) if (!num2(x.valores[k]) || x.valores[k] < 0) p.push(`${t}.${k}: valor n\xE3o pode ser negativo`);
    for (const k in x.situacoes ?? {}) {
      const s = x.situacoes[k];
      if (!(s.prob >= 0 && s.prob <= 100)) p.push(`${t}.${k}: chance precisa ficar entre 0 e 100`);
      if (!(s.valor >= 0)) p.push(`${t}.${k}: valor n\xE3o pode ser negativo`);
    }
    for (const a in x.agentes ?? {}) {
      const s = x.agentes[a];
      if (![0.1, 0.2, 0.4].includes(s.grau)) p.push(`${t}.${a}: grau precisa ser 10%, 20% ou 40%`);
      for (const f of ["prob", "prob_epi", "prob_fora"]) if (s[f] !== void 0 && !(s[f] >= 0 && s[f] <= 100)) p.push(`${t}.${a}.${f}: chance precisa ficar entre 0 e 100`);
    }
    const w = c._pesos_tese?.[t];
    if (w !== void 0 && !(w >= 0)) p.push(`${t}: peso da tese n\xE3o pode ser negativo`);
  }
  const F = c._faixas ?? {}, l = F.limites ?? [];
  if (!(l.length === 3 && l[0] > 0 && l[0] < l[1] && l[1] < l[2])) p.push("Faixas: os limites precisam ser crescentes (Prata\u2192Ouro < Ouro\u2192Tit\xE2nio < Tit\xE2nio\u2192Diamante)");
  if (!(Array.isArray(F.comissao) && F.comissao.length === 4 && F.comissao.every((v) => v >= 0))) p.push("Comiss\xE3o: 4 valores, nenhum negativo");
  if (!(F.peso_tamanho >= 0 && F.peso_tamanho <= 100)) p.push("Peso do tamanho: entre 0 e 100");
  if (!["composto", "bruto", "esperado"].includes(F.base_faixa)) p.push("Base da faixa inv\xE1lida");
  if (!(Array.isArray(F.score_faixas) && F.score_faixas.length === 10)) p.push("Faixas de score: precisam ser 10");
  else F.score_faixas.forEach((b, i) => {
    if (!(Number.isInteger(b.mover_faixa) && b.mover_faixa >= -3 && b.mover_faixa <= 2)) p.push(`Score ${i * 10}%: mover faixa entre \u22123 e +2`);
    if (!(b.pct_comissao >= 0)) p.push(`Score ${i * 10}%: % da comiss\xE3o n\xE3o pode ser negativo`);
  });
  const G = c._geral ?? {};
  if (!(G.selo_media >= 0 && G.selo_media <= G.selo_forte && G.selo_forte <= 100)) p.push("Selos: m\xE9dia \u2264 forte, entre 0 e 100");
  if (!(G.sm > 0)) p.push("Sal\xE1rio m\xEDnimo precisa ser maior que 0");
  if (!(G.reflexo >= 1)) p.push("Reflexo precisa ser 1 ou mais");
  return p;
}
function compararCalibracoes(a, b) {
  const out = [], cat = CATALOGO;
  const rot = (cam) => {
    const [t, g, k, f] = cam;
    if (t === "_faixas") return `Faixas e comiss\xE3o \u203A ${cam.slice(1).join(" \u203A ")}`;
    if (t === "_geral") return `Geral \u203A ${g}`;
    if (t === "_pesos_tese") return `Peso da tese \u203A ${cat[g]?.nome ?? g}`;
    const nome = cat[t]?.nome ?? t;
    const lab = g === "probs" ? cat[t]?.probs?.[k]?.label : g === "valores" ? cat[t]?.valores?.[k]?.label : g === "agentes" ? cat[t]?.agentes?.[k]?.label : g === "situacoes" ? cat[t]?.situacoes?.[k]?.label : void 0;
    return `${nome} \u203A ${lab ?? k}${f ? ` \u203A ${f}` : ""}`;
  };
  const anda = (x, y, cam) => {
    if (x && y && typeof x === "object" && typeof y === "object") {
      for (const k of /* @__PURE__ */ new Set([...Object.keys(x), ...Object.keys(y)])) if (!k.startsWith("_salvo") && k !== "_versao" && k !== "_motor") anda(x[k], y[k], [...cam, k]);
    } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ caminho: cam.join("."), rotulo: rot(cam), antes: x, depois: y });
  };
  anda(a, b, []);
  return out;
}
export {
  AUTO_SEM_REGISTRO,
  AUTO_SEM_REGISTRO_SITUACAO,
  AVISOS_BLOQUEANTES,
  CALIBRACAO_V1,
  CATALOGO,
  FAIXAS,
  MENSAGEM_FALTA,
  MOTOR_VERSAO,
  NOME_TESE,
  PASSO_DADOS,
  PASSO_SAIDA,
  PERGUNTAS,
  SAIDAS,
  TITULOS_PASSO,
  calcularCaso,
  compararCalibracoes,
  conferirCalibracao,
  mesclarCalibracao,
  padraoDe,
  pendenciaDaTese,
  perguntasVisiveis
};
