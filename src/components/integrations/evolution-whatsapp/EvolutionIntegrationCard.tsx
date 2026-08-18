import { useMemo } from 'react';
import { ChatCircle } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/hooks/useOrganization';
import { useEvolutionInstances } from '@/hooks/useEvolutionInstances';

interface EvolutionIntegrationCardProps {
  integration: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
  };
  onOpen: () => void;
}

/**
 * Card do catálogo de Integrações para a Evolution WhatsApp.
 *
 * Diferente do card genérico, NÃO exibe toggle: `organization_integrations.is_enabled`
 * não representa o estado real da integração (não conecta/desconecta instância).
 * O estado exibido é derivado exclusivamente das instâncias da organização
 * (`evolution_instances.provisioning_status` + `last_known_state`).
 * Apenas apresentação — nenhuma escrita, nenhuma chamada de backend.
 */
export function EvolutionIntegrationCard({ integration, onOpen }: EvolutionIntegrationCardProps) {
  const { organization } = useOrganization();
  const { data: instances, isLoading } = useEvolutionInstances();

  const statusBadge = useMemo(() => {
    if (isLoading) {
      return <Badge variant="outline" className="text-[10px]">Verificando…</Badge>;
    }

    const orgInstances = (instances ?? []).filter(
      (i) => !organization?.id || i.organization_id === organization.id,
    );

    if (orgInstances.length === 0) {
      return <Badge variant="outline" className="text-[10px]">Não configurado</Badge>;
    }

    const connected = orgInstances.some(
      (i) => i.provisioning_status === 'linked' && i.last_known_state === 'open',
    );
    if (connected) {
      return <Badge className="text-[10px] bg-green-600 text-white">Conectado</Badge>;
    }

    const awaiting = orgInstances.some(
      (i) =>
        i.last_known_state === 'connecting' ||
        (i.provisioning_status !== 'linked' && i.provisioning_status !== 'failed'),
    );
    if (awaiting) {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
          Aguardando conexão
        </Badge>
      );
    }

    return <Badge variant="secondary" className="text-[10px]">Desconectado</Badge>;
  }, [instances, isLoading, organization?.id]);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {integration.logo_url ? (
          <img
            src={integration.logo_url}
            alt={integration.name}
            className="w-10 h-10 rounded-lg object-contain bg-muted p-1 shrink-0"
          />
        ) : (
          <div className="p-2 rounded-lg bg-muted shrink-0">
            <ChatCircle className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground truncate">{integration.name}</h3>
            {statusBadge}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {integration.description}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={onOpen}>
          Ver integração
        </Button>
      </div>
    </Card>
  );
}
