import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';

interface PipelineStage {
  id: string;
  name: string;
  order_index: number;
  type: string;
}

interface Opportunity {
  id: string;
  title: string;
  amount: number;
  currency: string;
  pipeline_stage_id: string;
  contact_id: string | null;
  contacts?: {
    full_name: string;
  } | null;
}

export default function OpportunitiesKanban() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch pipeline stages
      const { data: stagesData } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('organization_id', organization.id)
        .order('order_index');

      if (stagesData) {
        setStages(stagesData);
      }

      // Fetch opportunities with contact info
      const { data: oppsData } = await supabase
        .from('opportunities')
        .select(`
          *,
          contacts (
            full_name
          )
        `)
        .eq('organization_id', organization.id)
        .eq('status', 'open')
        .is('deleted_at', null);

      if (oppsData) {
        setOpportunities(oppsData);
      }

      setLoading(false);
    };

    fetchData();
  }, [organization]);

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat(locale === 'en-US' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(value);
  };

  const getOpportunitiesForStage = (stageId: string) => {
    return opportunities.filter((opp) => opp.pipeline_stage_id === stageId);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('opportunities.title')}</h1>
            <p className="text-muted-foreground mt-1">
              Visualize e gerencie seu pipeline de vendas
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t('opportunities.newOpportunity')}
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageOpportunities = getOpportunitiesForStage(stage.id);
            const stageTotal = stageOpportunities.reduce(
              (sum, opp) => sum + (Number(opp.amount) || 0),
              0
            );

            return (
              <div key={stage.id} className="flex-shrink-0 w-80">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base font-medium">{stage.name}</CardTitle>
                      <span className="text-sm text-muted-foreground">
                        {stageOpportunities.length}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatCurrency(stageTotal, organization?.default_currency || 'BRL')}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stageOpportunities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma oportunidade
                      </p>
                    ) : (
                      stageOpportunities.map((opp) => (
                        <Card key={opp.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                          <h4 className="font-medium text-sm mb-2">{opp.title}</h4>
                          <p className="text-xs text-muted-foreground mb-2">
                            {opp.contacts?.full_name || 'Sem contato'}
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            {formatCurrency(Number(opp.amount), opp.currency)}
                          </p>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}