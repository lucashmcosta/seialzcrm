import { Link } from 'react-router-dom';
import { ArrowRight, Scales } from '@phosphor-icons/react';
import { usePermissions } from '@/hooks/usePermissions';
import { podeVerRelatorioClassificacoes } from './permissoes';
import { useProcessClassificationEnabled } from './useProcessClassificationEnabled';

/** Atalho para o relatório de classificações (/classificacoes). Só com o módulo ligado e escopo Equipe/Todos (nunca para o vendedor). */
export function LinkClassificacoes() {
  const ligado = useProcessClassificationEnabled();
  const { permissions } = usePermissions();
  if (!ligado || !podeVerRelatorioClassificacoes(permissions)) return null;
  return (
    <Link to="/classificacoes" className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm hover:bg-muted/50">
      <span className="flex items-center gap-2"><Scales className="h-5 w-5 text-primary" />
        <span><span className="font-medium">Classificações de processos</span>
          <span className="block text-xs text-muted-foreground">Faixa e comissão por venda, correções, certificações e exportação</span></span></span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
