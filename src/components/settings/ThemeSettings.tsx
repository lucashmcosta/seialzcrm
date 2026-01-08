import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Check, Loader2, Palette, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLOR_PRESETS = [
  { name: 'Azul Elétrico', value: '234 91% 56%', color: '#2B40F5' },
  { name: 'Deep Blue', value: '206 50% 29%', color: 'hsl(206, 50%, 29%)' },
  { name: 'Azul', value: '217 100% 61%', color: 'hsl(217, 100%, 61%)' },
  { name: 'Ocean', value: '200 70% 45%', color: 'hsl(200, 70%, 45%)' },
  { name: 'Forest', value: '142 60% 35%', color: 'hsl(142, 60%, 35%)' },
  { name: 'Purple', value: '270 60% 45%', color: 'hsl(270, 60%, 45%)' },
  { name: 'Orange', value: '25 90% 50%', color: 'hsl(25, 90%, 50%)' },
  { name: 'Red', value: '0 70% 50%', color: 'hsl(0, 70%, 50%)' },
  { name: 'Teal', value: '180 60% 40%', color: 'hsl(180, 60%, 40%)' },
  { name: 'Pink', value: '330 70% 50%', color: 'hsl(330, 70%, 50%)' },
];

const SIDEBAR_PRESETS = [
  { name: 'Claro', value: '0 0% 98%', color: 'hsl(0, 0%, 98%)' },
  { name: 'Cinza', value: '220 14% 96%', color: 'hsl(220, 14%, 96%)' },
  { name: 'Escuro', value: '220 20% 14%', color: 'hsl(220, 20%, 14%)' },
];

export function ThemeSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { 
    primaryColor, 
    sidebarColor, 
    darkMode, 
    setPrimaryColor, 
    setSidebarColor, 
    setDarkMode,
    setPreviewMode,
    setJustSaved
  } = useTheme();
  
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track original values for comparison
  const [originalValues, setOriginalValues] = useState({
    primary: '',
    sidebar: '',
    dark: false,
  });

  useEffect(() => {
    if (organization) {
      const original = {
        primary: organization.theme_primary_color || '234 91% 56%',
        sidebar: organization.theme_sidebar_color || '0 0% 98%',
        dark: organization.theme_dark_mode || false,
      };
      setOriginalValues(original);
    }
  }, [organization]);

  useEffect(() => {
    const changed = 
      primaryColor !== originalValues.primary ||
      sidebarColor !== originalValues.sidebar ||
      darkMode !== originalValues.dark;
    setHasChanges(changed);
    setPreviewMode(changed);
  }, [primaryColor, sidebarColor, darkMode, originalValues, setPreviewMode]);

  const handleSave = async () => {
    if (!organization) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          theme_primary_color: primaryColor,
          theme_sidebar_color: sidebarColor,
          theme_dark_mode: darkMode,
        })
        .eq('id', organization.id);

      if (error) throw error;
      
      setOriginalValues({
        primary: primaryColor,
        sidebar: sidebarColor,
        dark: darkMode,
      });
      setJustSaved(true);
      setPreviewMode(false);
      toast.success(t('settings.themeUpdated'));
    } catch (error) {
      console.error('Error saving theme:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPrimaryColor(originalValues.primary);
    setSidebarColor(originalValues.sidebar);
    setDarkMode(originalValues.dark);
    setPreviewMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Primary Color */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>{t('settings.primaryColor')}</CardTitle>
          </div>
          <CardDescription>{t('settings.primaryColorDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setPrimaryColor(preset.value)}
                className={cn(
                  "relative h-12 w-12 rounded-full border-2 transition-all hover:scale-110",
                  primaryColor === preset.value 
                    ? "border-foreground ring-2 ring-foreground ring-offset-2" 
                    : "border-transparent"
                )}
                style={{ backgroundColor: preset.color }}
                title={preset.name}
              >
                {primaryColor === preset.value && (
                  <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-md" />
                )}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            {t('settings.selectedColor')}: {COLOR_PRESETS.find(p => p.value === primaryColor)?.name || 'Custom'}
          </p>
        </CardContent>
      </Card>

      {/* Sidebar Color */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.sidebarColor')}</CardTitle>
          <CardDescription>{t('settings.sidebarColorDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {SIDEBAR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setSidebarColor(preset.value)}
                className={cn(
                  "relative flex items-center justify-center h-16 w-24 rounded-lg border-2 transition-all hover:scale-105",
                  sidebarColor === preset.value 
                    ? "border-primary ring-2 ring-primary ring-offset-2" 
                    : "border-border"
                )}
                style={{ backgroundColor: preset.color }}
              >
                <span 
                  className={cn(
                    "text-xs font-medium",
                    preset.value.includes('14%') ? "text-white" : "text-foreground"
                  )}
                >
                  {preset.name}
                </span>
                {sidebarColor === preset.value && (
                  <Check className={cn(
                    "absolute top-1 right-1 h-4 w-4",
                    preset.value.includes('14%') ? "text-white" : "text-primary"
                  )} />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dark Mode */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            <CardTitle>{t('settings.darkMode')}</CardTitle>
          </div>
          <CardDescription>{t('settings.darkModeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode" className="text-base">
              {darkMode ? t('settings.darkModeEnabled') : t('settings.darkModeDisabled')}
            </Label>
            <Switch
              id="dark-mode"
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview Notice */}
      {hasChanges && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-primary">{t('settings.themePreview')}</p>
                <p className="text-sm text-muted-foreground">{t('settings.themePreviewDescription')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
