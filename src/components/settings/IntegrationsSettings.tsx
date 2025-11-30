import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n';
import { useOrganization } from '@/hooks/useOrganization';
import { MessageSquare, Phone, Mail, Webhook } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: any;
  status: 'coming_soon' | 'not_connected' | 'connected';
}

export function IntegrationsSettings() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);

  const integrations: Integration[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'Integre conversas do WhatsApp com seus contatos',
      icon: MessageSquare,
      status: 'coming_soon',
    },
    {
      id: 'telephony',
      name: 'Telefonia',
      description: 'Faça e receba ligações diretamente do sistema',
      icon: Phone,
      status: 'coming_soon',
    },
    {
      id: 'email',
      name: 'E-mail',
      description: 'Sincronize e-mails com a linha do tempo de contatos',
      icon: Mail,
      status: 'coming_soon',
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      description: 'Configure webhooks para integrar com outros sistemas',
      icon: Webhook,
      status: 'coming_soon',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500">Conectado</Badge>;
      case 'not_connected':
        return <Badge variant="secondary">Não conectado</Badge>;
      case 'coming_soon':
        return <Badge variant="outline">Em breve</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integrações Disponíveis</CardTitle>
          <CardDescription>
            Conecte suas ferramentas favoritas ao Seialz
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-muted">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-medium">{integration.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(integration.status)}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={integration.status === 'coming_soon'}
                    >
                      Configurar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API & Webhooks</CardTitle>
          <CardDescription>
            Informações para desenvolvedores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            A documentação da API e configuração de webhooks estarão disponíveis em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
