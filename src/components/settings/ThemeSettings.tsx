import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Check, Palette, Moon, Sun } from 'lucide-react';
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
  } = useTheme();
  
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [savingSidebar, setSavingSidebar] = useState(false);
  const [savingDarkMode, setSavingDarkMode] = useState(false);

  const handlePrimaryColorChange = async (value: string) => {
    if (!organization || savingPrimary) return;
    
    // Update visually immediately
    setPrimaryColor(value);
    setSavingPrimary(true);
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ theme_primary_color: value })
        .eq('id', organization.id);

      if (error) throw error;
      toast.success(t('settings.themeUpdated'));
    } catch (error) {
      console.error('Error saving primary color:', error);
      toast.error(t('common.error'));
    } finally {
      setSavingPrimary(false);
    }
  };

  const handleSidebarColorChange = async (value: string) => {
    if (!organization || savingSidebar) return;
    
    // Update visually immediately
    setSidebarColor(value);
    setSavingSidebar(true);
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ theme_sidebar_color: value })
        .eq('id', organization.id);

      if (error) throw error;
      toast.success(t('settings.themeUpdated'));
    } catch (error) {
      console.error('Error saving sidebar color:', error);
      toast.error(t('common.error'));
    } finally {
      setSavingSidebar(false);
    }
  };

  const handleDarkModeChange = async (enabled: boolean) => {
    if (!organization || savingDarkMode) return;
    
    // Update visually immediately
    setDarkMode(enabled);
    setSavingDarkMode(true);
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ theme_dark_mode: enabled })
        .eq('id', organization.id);

      if (error) throw error;
      toast.success(t('settings.themeUpdated'));
    } catch (error) {
      console.error('Error saving dark mode:', error);
      toast.error(t('common.error'));
    } finally {
      setSavingDarkMode(false);
    }
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
                onClick={() => handlePrimaryColorChange(preset.value)}
                disabled={savingPrimary}
                className={cn(
                  "relative h-12 w-12 rounded-full border-2 transition-all hover:scale-110 disabled:opacity-50",
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
                onClick={() => handleSidebarColorChange(preset.value)}
                disabled={savingSidebar}
                className={cn(
                  "relative flex items-center justify-center h-16 w-24 rounded-lg border-2 transition-all hover:scale-105 disabled:opacity-50",
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
              onCheckedChange={handleDarkModeChange}
              disabled={savingDarkMode}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
