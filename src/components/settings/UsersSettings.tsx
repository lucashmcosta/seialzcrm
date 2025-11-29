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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, UserPlus } from 'lucide-react';

interface UserMembership {
  id: string;
  user_id: string;
  is_active: boolean;
  users: {
    full_name: string;
    email: string;
  };
}

export function UsersSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMemberships();
  }, [organization?.id]);

  const fetchMemberships = async () => {
    if (!organization?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('id, user_id, is_active, users(full_name, email)')
        .eq('organization_id', organization.id);

      if (error) throw error;
      setMemberships(data || []);
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    setSubmitting(true);
    try {
      // Get admin permission profile
      const { data: profiles } = await supabase
        .from('permission_profiles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('name', 'Admin')
        .single();

      const { error } = await supabase
        .from('invitations')
        .insert({
          organization_id: organization.id,
          email: inviteEmail,
          permission_profile_id: profiles?.id,
          invited_by_user_id: (await supabase.auth.getUser()).data.user?.id,
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
    try {
      const { error } = await supabase
        .from('user_organizations')
        .update({ is_active: !currentStatus })
        .eq('id', membershipId);

      if (error) throw error;

      toast({
        description: !currentStatus ? 'User activated' : 'User deactivated',
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
            <CardDescription>Manage users and their permissions</CardDescription>
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
                    Send an invitation to join your organization
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
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
                    {membership.is_active ? 'Deactivate' : 'Activate'}
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
