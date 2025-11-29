import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function TasksList() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('tasks.title')}</h1>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t('tasks.newTask')}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Card className="p-6">
            <p className="text-muted-foreground">{t('tasks.title')} - Coming soon</p>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
