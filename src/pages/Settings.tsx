import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { UsersSettings } from '@/components/settings/UsersSettings';
import { PipelineSettings } from '@/components/settings/PipelineSettings';
import { DuplicatePreventionSettings } from '@/components/settings/DuplicatePreventionSettings';
import { CustomFieldsSettings } from '@/components/settings/CustomFieldsSettings';
import { TagsSettings } from '@/components/settings/TagsSettings';

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
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="users">
              <UsersSettings />
            </TabsContent>

            <TabsContent value="pipeline">
              <PipelineSettings />
            </TabsContent>

            <TabsContent value="duplicates">
              <DuplicatePreventionSettings />
            </TabsContent>

            <TabsContent value="customFields">
              <CustomFieldsSettings />
            </TabsContent>

            <TabsContent value="tags">
              <TagsSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
