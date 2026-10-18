import { Scales } from '@phosphor-icons/react';

/**
 * Prévia estática para a galeria /widgets (todos os usuários veem). Neutra de propósito: não mostra as faixas
 * (o vendedor nunca vê a escada Prata → Diamante, SPEC §5.3).
 */
export function ProcessClassificationPreview() {
  return (
    <div className="flex flex-col items-center gap-1.5 py-3 text-center">
      <Scales size={32} weight="duotone" className="text-primary" />
      <span className="text-xs text-muted-foreground">Classificação do processo na oportunidade</span>
    </div>
  );
}
