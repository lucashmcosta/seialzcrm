import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';

/**
 * Isola cada janela do Workspace: erro de um widget (inclusive chunk que não carrega — ex.: 404 do deploy que
 * ficou no cache do navegador) fica só na janela dele. Sem isto o erro sobe até o boundary raiz e derruba o app
 * inteiro, em qualquer tela, porque o Workspace remonta as janelas abertas ao carregar.
 */
export class WidgetErrorBoundary extends Component<{ widgetKey: string; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(error: unknown) {
    Sentry.captureException(error, { tags: { widget: this.props.widgetKey } });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Não foi possível abrir este widget.</p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ erro: false })}>Tentar de novo</Button>
      </div>
    );
  }
}
