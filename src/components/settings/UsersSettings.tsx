import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus } from 'lucide-react';

interface UserMembership {
  id: string;
  user_id: string;
  is_active: boolean;
  permission_profile_id: string | null;
  users: {
    full_name: string;
    email: string;
  };
  permission_profiles?: {
    name: string;
  } | null;
}

interface PermissionProfile {
  id: string;
  name: string;
}

export function UsersSettings() {
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<PermissionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchMemberships();
      fetchPermissionProfiles();
    }
  }, [organization?.id]);

  const fetchMemberships = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('id, user_id, is_active, permission_profile_id, users(full_name, email), permission_profiles(name)')
        .eq('organization_id', organization.id);

      if (error) throw error;
      setMemberships(data || []);
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionProfiles = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('permission_profiles')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name');

      if (error) throw error;
      setPermissionProfiles(data || []);
      
      // Set default to first profile if available
      if (data && data.length > 0 && !selectedProfileId) {
        const salesRep = data.find(p => p.name === 'Sales Rep');
        setSelectedProfileId(salesRep?.id || data[0].id);
      }
    } catch (error) {
      console.error('Error fetching permission profiles:', error);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !userProfile?.id) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('invitations')
        .insert({
          organization_id: organization.id,
          email: inviteEmail,
          permission_profile_id: selectedProfileId || null,
          invited_by_user_id: userProfile.id,
          token: crypto.randomUUID(),
          status: 'pending',
        });

      if (error) throw error;

      toast({
        description: t('settings.userInvited'),
      });
      setDialogOpen(false);
      setInviteEmail('');
    } catch (error) {
      console.error('Error inviting user:', error);
      toast({
        variant: 'destructive',
        description: t('common.error'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (membershipId: string, currentStatus: boolean) => {
    if (!organization?.id) return;

    try {
      // If activating, check seat limit
      if (!currentStatus) {
        // Get subscription details
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('id, max_seats')
          .eq('organization_id', organization.id)
          .single();

        // Get current seat count
        const { data: usage } = await supabase
          .from('subscription_usage')
          .select('current_seat_count')
          .eq('subscription_id', subscription?.id || '')
          .single();

        const currentSeats = usage?.current_seat_count || 0;
        const maxSeats = subscription?.max_seats || 0;

        if (currentSeats >= maxSeats) {
          toast({
            variant: 'destructive',
            title: t('settings.seatLimitReached'),
            description: t('settings.seatLimitDescription'),
          });
          return;
        }
      }

      const { error } = await supabase
        .from('user_organizations')
        .update({ is_active: !currentStatus })
        .eq('id', membershipId);

      if (error) throw error;

      // Update seat count
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('organization_id', organization.id)
        .single();

      if (subscription) {
        const activeCount = memberships.filter(m => 
          m.id === membershipId ? !currentStatus : m.is_active
        ).length;

        await supabase
          .from('subscription_usage')
          .update({ 
            current_seat_count: activeCount,
            last_calculated_at: new Date().toISOString()
          })
          .eq('subscription_id', subscription.id);
      }

      toast({
        description: !currentStatus ? t('settings.userActivated') : t('settings.userDeactivated'),
      });
      fetchMemberships();
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast({
        variant: 'destructive',
        description: t('common.error'),
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('settings.users')}</CardTitle>
            <CardDescription>Gerencie usuários e suas permissões</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                {t('settings.inviteUser')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>{t('settings.inviteUser')}</DialogTitle>
                  <DialogDescription>
                    Envie um convite para entrar na sua organização
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('settings.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile">{t('settings.role')}</Label>
                    <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                      <SelectTrigger id="profile">
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {permissionProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O perfil define as permissões que o usuário terá no sistema
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.confirm')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>{t('settings.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberships.map((membership) => (
              <TableRow key={membership.id}>
                <TableCell className="font-medium">{membership.users.full_name}</TableCell>
                <TableCell>{membership.users.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {membership.permission_profiles?.name || 'Sem perfil'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={membership.is_active ? 'default' : 'secondary'}>
                    {membership.is_active ? t('settings.active') : t('settings.inactive')}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleStatus(membership.id, membership.is_active)}
                  >
                    {membership.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
