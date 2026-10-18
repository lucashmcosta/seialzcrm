import { Calculator, GridNine, Scales } from '@phosphor-icons/react';
import type { WidgetDefinition } from './types';
import { OvertimeCalculatorWidget } from './overtime-calculator/OvertimeCalculatorWidget';
import { TicTacToeWidget } from './tic-tac-toe/TicTacToeWidget';
import { OvertimePreview } from './overtime-calculator/OvertimePreview';
import { TicTacToePreview } from './tic-tac-toe/TicTacToePreview';
import { ProcessClassificationWidget } from './process-classification/ProcessClassificationWidget';
import { ProcessClassificationPreview } from './process-classification/ProcessClassificationPreview';

/**
 * Catálogo global de widgets. Tudo aqui aparece em Configurações para todos
 * os tenants (desligado). Não registrar widgets de teste/dummy.
 */
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    key: 'overtime_calculator',
    name: 'Calculadora de Horas Extras',
    description: 'Estimativa simples do valor de horas extras a partir do salário mensal.',
    icon: Calculator,
    contextMode: 'none',
    Component: OvertimeCalculatorWidget,
    Preview: OvertimePreview,
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
];

const byKey = new Map(WIDGET_REGISTRY.map((w) => [w.key, w]));
export function getWidget(key: string): WidgetDefinition | undefined {
  return byKey.get(key);
}
