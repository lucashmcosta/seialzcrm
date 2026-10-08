import { Calculator } from '@phosphor-icons/react';
import type { WidgetDefinition } from './types';
import { OvertimeCalculatorWidget } from './overtime-calculator/OvertimeCalculatorWidget';

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
    screens: ['commercial', 'inbox'],
    openModes: ['modal', 'drawer'],
    defaultOpenMode: 'drawer',
    Component: OvertimeCalculatorWidget,
  },
];

const byKey = new Map(WIDGET_REGISTRY.map((w) => [w.key, w]));
export function getWidget(key: string): WidgetDefinition | undefined {
  return byKey.get(key);
}
