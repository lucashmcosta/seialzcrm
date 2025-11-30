import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, ExternalLink } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  status: string;
  category: string;
  documentation_url: string | null;
}

interface IntegrationCardProps {
  integration: Integration;
}

export function IntegrationCard({ integration }: IntegrationCardProps) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      available: { variant: 'default' as const, label: 'Disponível' },
      beta: { variant: 'secondary' as const, label: 'Beta' },
      coming_soon: { variant: 'outline' as const, label: 'Em Breve' },
      deprecated: { variant: 'destructive' as const, label: 'Descontinuada' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.coming_soon;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      communication: 'Comunicação',
      payment: 'Pagamentos',
      marketing: 'Marketing',
      automation: 'Automação',
      other: 'Outros',
    };
    return labels[category as keyof typeof labels] || category;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {integration.logo_url ? (
              <img
                src={integration.logo_url}
                alt={integration.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <CardTitle className="text-lg">{integration.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{getCategoryLabel(integration.category)}</p>
            </div>
          </div>
          {getStatusBadge(integration.status)}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="min-h-[60px] mb-4">
          {integration.description || 'Sem descrição'}
        </CardDescription>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate(`/admin/integrations/${integration.id}`)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </Button>
          {integration.documentation_url && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(integration.documentation_url!, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}