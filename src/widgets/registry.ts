import { Calculator, GridNine, PawPrint, Scales } from '@phosphor-icons/react';
import type { WidgetDefinition } from './types';
import { LaborCenterWidget } from './labor-center/LaborCenterWidget';
import { TicTacToeWidget } from './tic-tac-toe/TicTacToeWidget';
import { LaborCenterPreview } from './labor-center/LaborCenterPreview';
import { TicTacToePreview } from './tic-tac-toe/TicTacToePreview';
import { ProcessClassificationWidget } from './process-classification/ProcessClassificationWidget';
import { ProcessClassificationPreview } from './process-classification/ProcessClassificationPreview';
import { PlamevQuoteWidget } from './plamev-quote/PlamevQuoteWidget';
import { PlamevQuotePreview } from './plamev-quote/PlamevQuotePreview';

/**
 * Catálogo global de widgets. Tudo aqui aparece em Configurações para todos
 * os tenants (desligado). Não registrar widgets de teste/dummy.
 */
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    // Chave mantida do antigo "Calculadora de Horas Extras": orgs que já ligaram (organization_widgets) e pins seguem valendo.
    key: 'overtime_calculator',
    name: 'Central Trabalhista',
    description: 'Prescrição, horas extras, adicionais, intervalo, rescisão e FGTS, com perguntas ao lead, premissas e faixa de valor.',
    icon: Calculator,
    contextMode: 'none',
    Component: LaborCenterWidget,
    Preview: LaborCenterPreview,
    agentTools: [{
      id: 'calculate_labor_case',
      name: 'Calculadora da rescisão',
      description: 'Usa a calculadora da Central Trabalhista e manda ao cliente o mesmo cálculo da rescisão que a equipe manda. Lê as datas da carteira de trabalho digital em PDF. Só funciona com o widget ligado',
      trigger: 'Quando souber salário, entrada, saída e como saiu',
    }],
  },
  {
    key: 'tic_tac_toe',
    name: 'Jogo da Velha',
    description: 'Partida rápida de jogo da velha contra o computador.',
    icon: GridNine,
    contextMode: 'none',
    Component: TicTacToeWidget,
    Preview: TicTacToePreview,
  },
  {
    // Ligar este widget liga o módulo de classificação na org (exige calibração publicada; ver docs/classificacao-v1).
    key: 'process_classification',
    name: 'Classificação do processo',
    description: 'O vendedor classifica o caso trabalhista e vê a faixa e a comissão da venda.',
    icon: Scales,
    contextMode: 'opportunity',
    Component: ProcessClassificationWidget,
    Preview: ProcessClassificationPreview,
    settings: () => import('@/components/process-classification/settings/ProcessClassificationSettings'),
  },
  {
    // Cada org cola o próprio token da API da Plamev em "Configurar" (plamev_credentials, cifrado).
    key: 'plamev_quote',
    name: 'Plamev',
    description: 'Cota planos pet da Plamev com campanhas e cupom, acompanha o pagamento e envia ao cliente a rede credenciada e os materiais de apoio, e sugere respostas com IA.',
    icon: PawPrint,
    contextMode: 'none',
    Component: PlamevQuoteWidget,
    Preview: PlamevQuotePreview,
    settings: () => import('./plamev-quote/PlamevQuoteSettings'),
    agentTools: [
      {
        id: 'plamev_consultar_rede',
        name: 'Rede credenciada Plamev',
        description: 'Consulta as clínicas credenciadas perto do CEP do cliente e manda a lista das mais próximas. Só funciona com o widget ligado',
        trigger: 'Quando o cliente informar o CEP ou perguntar onde o plano atende',
      },
      {
        id: 'plamev_simular_plano',
        name: 'Simulação de preço Plamev',
        description: 'Simula o valor do plano para os pets do cliente, no cartão e no boleto, sem gravar cotação. Só funciona com o widget ligado',
        trigger: 'Quando souber o CEP, o plano e a espécie, raça e idade de cada pet',
      },
      {
        id: 'plamev_ler_materiais',
        name: 'Ler materiais da Plamev',
        description: 'Lê o texto revisado dos materiais de cobertura e carência para responder dúvidas. Só funciona com o widget ligado',
        trigger: 'Antes de responder sobre cobertura, carência ou limite de uso',
      },
      {
        id: 'plamev_enviar_material',
        name: 'Enviar material da Plamev',
        description: 'Envia ao cliente a imagem de resumo do plano, o comparativo dos planos ou o PDF da cobertura. Só funciona com o widget ligado',
        trigger: 'Ao apresentar um plano ou quando o cliente pedir os detalhes',
      },
    ],
  },
];

const byKey = new Map(WIDGET_REGISTRY.map((w) => [w.key, w]));
export function getWidget(key: string): WidgetDefinition | undefined {
  return byKey.get(key);
}
