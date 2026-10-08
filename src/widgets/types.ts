import type { ComponentType } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

export type WidgetScreen = 'commercial' | 'inbox' | 'opportunities' | 'contacts';
export type WidgetOpenMode = 'modal' | 'drawer';

/** Contexto entregue ao widget por tela. Oportunidades/Contatos: previstos, ainda sem host. */
export type WidgetContext =
  | { screen: 'commercial'; organizationId: string; threadId: string | null; contactId: string | null }
  | { screen: 'inbox'; organizationId: string; threadId: string | null; contactId: string | null }
  | { screen: 'opportunities'; organizationId: string; opportunityId: string | null }
  | { screen: 'contacts'; organizationId: string; contactId: string | null };

export interface WidgetDefinition {
  key: string;
  name: string;
  description: string;
  icon: PhosphorIcon;
  screens: WidgetScreen[];
  openModes: WidgetOpenMode[];
  defaultOpenMode: WidgetOpenMode;
  Component: ComponentType<{ context: WidgetContext }>;
}

export const SCREEN_LABELS: Record<WidgetScreen, string> = {
  commercial: 'Comercial',
  inbox: 'Atendimento',
  opportunities: 'Oportunidades',
  contacts: 'Contatos',
};

/** Telas que já têm host nesta etapa. */
export const ACTIVE_SCREENS: WidgetScreen[] = ['commercial', 'inbox'];
