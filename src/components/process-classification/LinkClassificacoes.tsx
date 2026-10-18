import { Link } from 'react-router-dom';
import { ArrowRight, Scales } from '@phosphor-icons/react';
import { canV2, usePermissions } from '@/hooks/usePermissions';
import { useProcessClassificationEnabled } from './useProcessClassificationEnabled';

/** Atalho para o relatório de classificações (/classificacoes). Só aparece com o módulo ligado e "Ver classificações". */
export function LinkClassificacoes() {
  const ligado = useProcessClassificationEnabled();
  const { permissions } = usePermissions();
  if (!ligado || !canV2(permissions, 'dados.classificacoes.ver', false)) return null;
  return (
    <Link to="/classificacoes" className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm hover:bg-muted/50">
      <span className="flex items-center gap-2"><Scales className="h-5 w-5 text-primary" />
        <span><span className="font-medium">Classificações de processos</span>
          <span className="block text-xs text-muted-foreground">Faixa e comissão por venda, correções, certificações e exportação</span></span></span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
