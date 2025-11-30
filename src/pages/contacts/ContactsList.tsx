import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Mail, Phone, Filter } from 'lucide-react';
import { SavedViewsDropdown } from '@/components/SavedViewsDropdown';
import { BulkActionsBar } from '@/components/BulkActionsBar';

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  lifecycle_stage: string;
  owner_user_id: string | null;
  created_at: string;
}

export default function ContactsList() {
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { permissions } = usePermissions();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  
  // Filters state
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;
  
  // Current filters and sort for SavedViews
  const currentFilters = { owner: ownerFilter, stage: stageFilter, search: searchTerm };
  const currentSort = { field: 'created_at', direction: 'desc' };
  
  const handleApplyView = (filters: any, sort: any) => {
    if (filters.owner) setOwnerFilter(filters.owner);
    if (filters.stage) setStageFilter(filters.stage);
    if (filters.search) setSearchTerm(filters.search);
  };

  useEffect(() => {
    if (!organization) return;
    fetchContacts();
    fetchUsers();
  }, [organization, currentPage, searchTerm, ownerFilter, stageFilter]);

  const fetchUsers = async () => {
    if (!organization) return;
    
    const { data } = await supabase
      .from('user_organizations')
      .select('user_id, users(id, full_name)')
      .eq('organization_id', organization.id)
      .eq('is_active', true);
    
    if (data) {
      const usersList = data
        .filter(u => u.users)
        .map(u => ({ id: u.users!.id, full_name: u.users!.full_name }));
      setUsers(usersList);
    }
  };

  const fetchContacts = async () => {
    if (!organization) return;

    setLoading(true);
    
    // Build query with filters
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organization.id)
      .is('deleted_at', null);
    
    // Apply filters
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
    }
    if (ownerFilter !== 'all') {
      query = query.eq('owner_user_id', ownerFilter);
    }
    if (stageFilter !== 'all') {
      query = query.eq('lifecycle_stage', stageFilter as 'lead' | 'customer' | 'inactive');
    }
    
    // Apply pagination
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (!error && data) {
      setContacts(data);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  // Filters now applied server-side, so we use contacts directly
  const filteredContacts = contacts;

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedIds(filteredContacts.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleBulkSuccess = () => {
    setSelectedIds([]);
    fetchContacts();
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('contacts.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('contacts.manageContacts')}
            </p>
          </div>
          <div className="flex gap-2">
            <SavedViewsDropdown
              module="contacts"
              currentFilters={currentFilters}
              currentSort={currentSort}
              onApplyView={handleApplyView}
            />
            {permissions.canEditContacts && (
              <Link to="/contacts/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('contacts.newContact')}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('contacts.owner')} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">{t('contacts.allOwners')}</SelectItem>
              {users.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('contacts.lifecycleStage')} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">{t('contacts.allStages')}</SelectItem>
              <SelectItem value="lead">{t('lifecycle.lead')}</SelectItem>
              <SelectItem value="customer">{t('lifecycle.customer')}</SelectItem>
              <SelectItem value="inactive">{t('lifecycle.inactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t('contacts.noContacts')}</p>
              <Link to="/contacts/new">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('contacts.newContact')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Select all checkbox */}
            <div className="mb-3 flex items-center gap-2 px-2">
              <Checkbox
                checked={selectedIds.length === filteredContacts.length && filteredContacts.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {selectedIds.length > 0 
                  ? `${selectedIds.length} ${t('contacts.selected')}`
                  : t('contacts.selectAll')
                }
              </span>
            </div>
            
            <div className="grid gap-4">
              {filteredContacts.map((contact) => (
                <Card key={contact.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={selectedIds.includes(contact.id)}
                        onCheckedChange={(checked) => handleSelectOne(contact.id, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Link to={`/contacts/${contact.id}`} className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {contact.full_name}
                            </h3>
                            {contact.email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="w-4 h-4" />
                                {contact.email}
                              </div>
                            )}
                            {contact.phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="w-4 h-4" />
                                {contact.phone}
                              </div>
                            )}
                            {contact.company_name && (
                              <p className="text-sm text-muted-foreground">{contact.company_name}</p>
                            )}
                          </div>
                          <div className="text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              contact.lifecycle_stage === 'customer' 
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {t(`lifecycle.${contact.lifecycle_stage}`)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Pagination */}
            {totalCount > pageSize && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('common.showing')} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} {t('common.of')} {totalCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                    disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BulkActionsBar
        selectedIds={selectedIds}
        module="contacts"
        users={users}
        onClear={() => setSelectedIds([])}
        onSuccess={handleBulkSuccess}
        locale={locale as 'pt-BR' | 'en-US'}
        canEdit={permissions.canEditContacts}
        canDelete={permissions.canDeleteContacts}
      />
    </Layout>
  );
}
