import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';

export default function Profile() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('profile.title')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-2xl mx-auto p-6">
            <p className="text-muted-foreground">{t('profile.title')} - Coming soon</p>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
