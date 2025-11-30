import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { CreditCard, Users } from 'lucide-react';

interface Subscription {
  plan_name: string | null;
  status: string | null;
  max_seats: number | null;
  price_per_seat: number | null;
  billing_period: string | null;
  current_period_end: string | null;
}

export function BillingSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [seatCount, setSeatCount] = useState(0);

  useEffect(() => {
    if (organization) {
      fetchSubscription();
      fetchSeatCount();
    }
  }, [organization]);

  const fetchSubscription = async () => {
    if (!organization) return;

    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', organization.id)
      .single();

    if (data) setSubscription(data);
  };

  const fetchSeatCount = async () => {
    if (!organization) return;

    const { count } = await supabase
      .from('user_organizations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    setSeatCount(count || 0);
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-500',
    trialing: 'bg-blue-500',
    past_due: 'bg-orange-500',
    canceled: 'bg-red-500',
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assinatura Atual</CardTitle>
          <CardDescription>
            Informações sobre seu plano e uso
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h3 className="text-xl font-bold capitalize">
                      Plano {subscription.plan_name || 'Free'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {subscription.billing_period === 'monthly' ? 'Mensal' : 'Anual'}
                    </p>
                  </div>
                </div>
                <Badge className={statusColors[subscription.status || 'active']}>
                  {subscription.status === 'active'
                    ? 'Ativo'
                    : subscription.status === 'trialing'
                    ? 'Período de teste'
                    : subscription.status === 'past_due'
                    ? 'Pagamento pendente'
                    : 'Cancelado'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Assentos Usados
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {seatCount} / {subscription.max_seats || '∞'}
                  </p>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">
                    Valor por Assento
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {subscription.price_per_seat
                      ? `R$ ${subscription.price_per_seat}`
                      : 'Gratuito'}
                  </p>
                </div>
              </div>

              {subscription.current_period_end && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Próxima renovação:{' '}
                    {new Date(subscription.current_period_end).toLocaleDateString(
                      locale
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações de Cobrança</CardTitle>
          <CardDescription>
            Gerencie suas informações de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            As funcionalidades de gerenciamento de cobrança estarão disponíveis em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
