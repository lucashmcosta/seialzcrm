import type { ComponentType } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

/** Telas que publicam contexto e guardam pins próprios. Widgets em si são globais. */
export type WidgetScreen = 'commercial' | 'inbox' | 'opportunities' | 'contacts';

/** Contexto opcional entregue ao widget. Sem contexto (ex.: aberto pelo catálogo) = null. */
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
  /** none = independente (qualquer tela); contact/thread/opportunity = usa o contexto atual ou mostra estado vazio. */
  contextMode?: 'none' | 'contact' | 'thread' | 'opportunity';
  Component: ComponentType<{ context: WidgetContext }>;
  /** Prévia estática para a galeria /widgets. Nunca monta o widget funcional. */
  Preview?: ComponentType;
  /** Página de configuração do widget em /settings/widgets/:key (carregada sob demanda). Cada página faz o próprio controle de acesso. */
  settings?: () => Promise<{ default: ComponentType<{ organizationId: string }> }>;
}
