import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Building2, Users, CreditCard } from 'lucide-react';

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  subscription: {
    plan_name: string;
    status: string;
    max_seats: number;
  } | null;
  seat_count: number;
}

export default function SaaSAdmin() {
  const navigate = useNavigate();
  const { userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [metrics, setMetrics] = useState({
    totalOrgs: 0,
    activeSubscriptions: 0,
    totalSeats: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile && !userProfile.is_platform_admin) {
      navigate('/dashboard');
    }
  }, [userProfile, navigate]);

  useEffect(() => {
    if (userProfile?.is_platform_admin) {
      fetchData();
    }
  }, [userProfile]);

  const fetchData = async () => {
    try {
      // Fetch organizations with subscriptions
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select(`
          id,
          name,
          slug,
          created_at,
          subscriptions (
            plan_name,
            status,
            max_seats
          )
        `)
        .order('created_at', { ascending: false });

      if (orgsError) throw orgsError;

      // Fetch seat counts for each org
      const orgsWithSeats = await Promise.all(
        (orgsData || []).map(async (org) => {
          const { count } = await supabase
            .from('user_organizations')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id)
            .eq('is_active', true);

          return {
            ...org,
            subscription: org.subscriptions?.[0] || null,
            seat_count: count || 0,
          };
        })
      );

      setOrganizations(orgsWithSeats as OrganizationData[]);

      // Calculate metrics
      const totalSeats = orgsWithSeats.reduce((sum, org) => sum + org.seat_count, 0);
      const activeSubscriptions = orgsWithSeats.filter(
        org => org.subscription?.status === 'active' || org.subscription?.status === 'trialing'
      ).length;

      setMetrics({
        totalOrgs: orgsWithSeats.length,
        activeSubscriptions,
        totalSeats,
      });
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile?.is_platform_admin) {
    return null;
  }

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('admin.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.totalOrganizations')}</p>
                  <p className="text-2xl font-bold">{metrics.totalOrgs}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.activeSubscriptions')}</p>
                  <p className="text-2xl font-bold">{metrics.activeSubscriptions}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.totalSeats')}</p>
                  <p className="text-2xl font-bold">{metrics.totalSeats}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Organizations List */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t('admin.organizations')}</h2>
            {loading ? (
              <p className="text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <div className="space-y-4">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium">{org.name}</h3>
                      <p className="text-sm text-muted-foreground">@{org.slug}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(org.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                    <div className="text-right">
                      {org.subscription ? (
                        <>
                          <p className="text-sm font-medium capitalize">
                            {org.subscription.plan_name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {org.subscription.status}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {org.seat_count} / {org.subscription.max_seats} {t('admin.seats')}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('admin.noSubscription')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
