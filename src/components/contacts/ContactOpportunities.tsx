import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Opportunity {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  close_date: string | null;
  created_at: string;
  pipeline_stages: {
    name: string;
    type: string;
  };
}

interface ContactOpportunitiesProps {
  contactId: string;
}

export function ContactOpportunities({ contactId }: ContactOpportunitiesProps) {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organization?.id) {
      fetchOpportunities();
    }
  }, [organization?.id, contactId]);

  const fetchOpportunities = async () => {
    if (!organization) return;

    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        id,
        title,
        amount,
        currency,
        status,
        close_date,
        created_at,
        pipeline_stages (
          name,
          type
        )
      `)
      .eq('organization_id', organization.id)
      .eq('contact_id', contactId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching opportunities:', error);
      setLoading(false);
      return;
    }

    setOpportunities(data || []);
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      open: { label: 'Aberta', variant: 'default' as const },
      won: { label: 'Ganha', variant: 'secondary' as const },
      lost: { label: 'Perdida', variant: 'destructive' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t('opportunities.title')}
        </h2>
        <Link to={`/opportunities/new?contact=${contactId}`}>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('opportunities.newOpportunity')}
          </Button>
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>{t('common.noResults')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opportunity) => (
            <Link
              key={opportunity.id}
              to={`/opportunities/${opportunity.id}`}
              className="block"
            >
              <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground">
                        {opportunity.title}
                      </h3>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {(opportunity.pipeline_stages as any)?.name || 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground mb-1">
                      {formatCurrency(opportunity.amount, opportunity.currency)}
                    </div>
                    {getStatusBadge(opportunity.status)}
                  </div>
                </div>
                {opportunity.close_date && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Data de fechamento: {new Date(opportunity.close_date).toLocaleDateString(locale)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
