// Gerado de dados/calibracao-v1.json — calibração inicial (semente). Substituir pela exportada do protótipo validado.
import type { Calibracao } from './tipos';
export const CALIBRACAO_V1: Calibracao = {
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
   "dm_leve": 20000,
   "dm_medio": 30000,
   "dm_grave": 50000,
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
   "dm_leve": 20000,
   "dm_medio": 30000,
   "dm_grave": 50000,
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
   "dm": 10000
  }
 },
 "dano_moral": {
  "probs": {
   "reforco_doc_test": 10
  },
  "situacoes": {
   "assedio": {
    "valor": 20000,
    "prob": 60
   },
   "sexual": {
    "valor": 25000,
    "prob": 55
   },
   "sem_banheiro": {
    "valor": 15000,
    "prob": 65
   },
   "restricao_banheiro": {
    "valor": 10000,
    "prob": 55
   },
   "refeicao": {
    "valor": 18000,
    "prob": 60
   },
   "degradante": {
    "valor": 18000,
    "prob": 60
   },
   "atraso": {
    "valor": 10000,
    "prob": 75
   },
   "jc_improbidade": {
    "valor": 10000,
    "prob": 55
   },
   "informalidade": {
    "valor": 15000,
    "prob": 60
   }
  }
 },
 "_faixas": {
  "limites": [
   40000,
   90000,
   200000
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
    "score": "0–9%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "10–19%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "20–29%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "30–39%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "40–49%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "50–59%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "60–69%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "70–79%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "80–89%",
    "mover_faixa": 0,
    "pct_comissao": 100
   },
   {
    "score": "90–100%",
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
} as any;
