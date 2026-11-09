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
  },
];

const byKey = new Map(WIDGET_REGISTRY.map((w) => [w.key, w]));
export function getWidget(key: string): WidgetDefinition | undefined {
  return byKey.get(key);
}
