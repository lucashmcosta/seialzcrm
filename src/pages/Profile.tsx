import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NameInput } from '@/components/NameInput';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';

export default function Profile() {
  const { locale: orgLocale, userProfile, organization } = useOrganization();
  const { user } = useAuth();
  const { t } = useTranslation(orgLocale as any);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Personal info
  const [fullName, setFullName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Preferences
  const [userLocale, setUserLocale] = useState(orgLocale);
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.full_name || '');
      setFirstName(userProfile.first_name || '');
      setLastName(userProfile.last_name || '');
      setEmail(userProfile.email || '');
      setAvatarUrl(userProfile.avatar_url || '');
      setUserLocale(userProfile.locale || organization?.default_locale || 'pt-BR');
      setTimezone(userProfile.timezone || organization?.timezone || 'America/Sao_Paulo');
    }
  }, [userProfile, organization]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${userProfile?.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      
      toast({
        title: t('profile.avatarUploaded'),
        description: t('profile.avatarUploadedDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);

      if (!userProfile?.id) return;

      // Prepare data based on locale
      const updateData: any = {
        email,
        avatar_url: avatarUrl || null,
        locale: userLocale,
        timezone,
      };

      if (userLocale === 'pt-BR') {
        updateData.full_name = fullName;
        // Derive first/last from full name
        const parts = fullName.trim().split(' ');
        updateData.first_name = parts[0] || null;
        updateData.last_name = parts.slice(1).join(' ') || null;
      } else {
        updateData.first_name = firstName;
        updateData.last_name = lastName;
        updateData.full_name = `${firstName} ${lastName}`.trim();
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userProfile.id);

      if (error) throw error;

      toast({
        title: t('profile.saved'),
        description: t('profile.savedDesc'),
      });

      // Reload page to refresh data
      window.location.reload();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (fullName) {
      const parts = fullName.split(' ');
      return parts.length >= 2 
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : parts[0][0].toUpperCase();
    }
    return email[0]?.toUpperCase() || '?';
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('profile.title')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.personalInfo')}</CardTitle>
                <CardDescription>{t('profile.personalInfoDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback>{getInitials()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="avatar" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent">
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        <span>{t('profile.uploadAvatar')}</span>
                      </div>
                    </Label>
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploading}
                    />
                  </div>
                </div>

                {/* Name Input */}
                <NameInput
                  locale={userLocale as any}
                  fullName={fullName}
                  firstName={firstName}
                  lastName={lastName}
                  onFullNameChange={setFullName}
                  onFirstNameChange={setFirstName}
                  onLastNameChange={setLastName}
                  required
                />

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled
                  />
                  <p className="text-sm text-muted-foreground">{t('profile.emailCannotChange')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Preferences */}
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.preferences')}</CardTitle>
                <CardDescription>{t('profile.preferencesDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Language */}
                <div className="space-y-2">
                  <Label htmlFor="locale">{t('settings.language')}</Label>
                  <Select value={userLocale} onValueChange={setUserLocale}>
                    <SelectTrigger id="locale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English (US)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Timezone */}
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t('settings.timezone')}</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">America/São Paulo (BRT)</SelectItem>
                      <SelectItem value="America/New_York">America/New York (EST)</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los Angeles (PST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Organizations */}
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.organizations')}</CardTitle>
                <CardDescription>{t('profile.organizationsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {organization && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{organization.name}</p>
                      <p className="text-sm text-muted-foreground">{organization.slug}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
