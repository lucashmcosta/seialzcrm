import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';

export default function Settings() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList>
              <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
              <TabsTrigger value="users">{t('settings.users')}</TabsTrigger>
              <TabsTrigger value="pipeline">{t('settings.pipeline')}</TabsTrigger>
              <TabsTrigger value="duplicates">{t('settings.duplicates')}</TabsTrigger>
              <TabsTrigger value="customFields">{t('settings.customFields')}</TabsTrigger>
              <TabsTrigger value="tags">{t('settings.tags')}</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.general')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="users">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.users')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="pipeline">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.pipeline')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="duplicates">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.duplicates')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="customFields">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.customFields')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="tags">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('settings.tags')} - Coming soon</p>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
