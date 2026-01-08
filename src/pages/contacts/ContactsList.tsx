import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SortDescriptor } from 'react-aria-components';
import { Edit01, Trash01 } from '@untitledui/icons';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search } from 'lucide-react';
import { SavedViewsDropdown } from '@/components/SavedViewsDropdown';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { PaginationWithPageSize } from '@/components/application/pagination/pagination';
import { PaginationPageMinimalCenter } from '@/components/application/pagination/pagination';
import {
  Table,
  TableCard,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableColumn,
  TableCheckboxHeader,
  TableCheckboxCell,
  TableRowActionsDropdown,
  TableRowAction,
} from '@/components/application/table/table';
import { ColumnSelector, type ColumnConfig } from '@/components/application/table/column-selector';
import { Avatar } from '@/components/base/avatar/avatar';
import { BadgeWithDot } from '@/components/base/badges/badges';
import type { BadgeColor } from '@/components/base/badges/badge-types';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

const DEFAULT_ITEMS_PER_PAGE = 25;

const lifecycleColors: Record<string, BadgeColor> = {
  lead: 'blue',
  qualified: 'purple',
  opportunity: 'warning',
  customer: 'success',
  churned: 'error',
  inactive: 'gray',
};

export default function ContactsList() {
  const navigate = useNavigate();
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
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  
  // Select all mode
  const [selectAllMode, setSelectAllMode] = useState<'page' | 'all' | 'none'>('none');
  
  // Sorting state
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'created_at',
    direction: 'descending',
  });

  // Column visibility state
  const availableColumns: ColumnConfig[] = useMemo(() => [
    { id: 'full_name', label: t('contacts.name'), isRequired: true },
    { id: 'lifecycle_stage', label: t('contacts.lifecycleStage') },
    { id: 'phone', label: t('contacts.phone') },
    { id: 'company_name', label: t('contacts.company') },
    { id: 'created_at', label: t('common.createdAt') },
  ], [t]);
  
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'full_name', 'lifecycle_stage', 'phone', 'company_name', 'created_at'
  ]);

  // Filtered columns based on visibility - ensures sync between header and cells
  const activeColumns = useMemo(() => 
    availableColumns.filter(col => visibleColumns.includes(col.id)),
    [availableColumns, visibleColumns]
  );
  
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
  }, [organization, currentPage, itemsPerPage, searchTerm, ownerFilter, stageFilter]);

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
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (!error && data) {
      setContacts(data);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  // Sort contacts client-side
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const column = sortDescriptor.column as keyof Contact;
      const aVal = a[column];
      const bVal = b[column];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let cmp = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      }

      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [contacts, sortDescriptor]);

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleItemsPerPageChange = (newValue: number) => {
    setItemsPerPage(newValue);
    setCurrentPage(1);
  };

  // Selection handlers
  const allSelected = sortedContacts.length > 0 && sortedContacts.every(c => selectedIds.includes(c.id));
  const someSelected = sortedContacts.some(c => selectedIds.includes(c.id)) && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sortedContacts.map(c => c.id));
      setSelectAllMode('page');
    } else {
      setSelectedIds([]);
      setSelectAllMode('none');
    }
  };

  const handleSelectAllContacts = async () => {
    if (!organization) return;
    
    // Fetch all contact IDs matching current filters
    let query = supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization.id)
      .is('deleted_at', null);
    
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
    }
    if (ownerFilter !== 'all') {
      query = query.eq('owner_user_id', ownerFilter);
    }
    if (stageFilter !== 'all') {
      query = query.eq('lifecycle_stage', stageFilter as 'lead' | 'customer' | 'inactive');
    }

    const { data } = await query;
    if (data) {
      setSelectedIds(data.map(c => c.id));
      setSelectAllMode('all');
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setSelectAllMode('none');
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleDelete = async (contactId: string) => {
    await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contactId);
    fetchContacts();
  };

  const handleBulkSuccess = () => {
    setSelectedIds([]);
    setSelectAllMode('none');
    fetchContacts();
  };

  const getLifecycleLabel = (stage: string | null) => {
    if (!stage) return 'Lead';
    return t(`lifecycle.${stage}`) || stage;
  };

  return (
    <Layout>
      <div className="p-8">
        {/* Breadcrumbs */}
        <Breadcrumbs 
          items={[{ label: t('contacts.title') }]} 
          className="mb-6"
        />

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('contacts.title')}</h1>
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
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
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

          <ColumnSelector
            columns={availableColumns}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
            label={t('common.columns') || 'Colunas'}
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : sortedContacts.length === 0 ? (
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
          <TableCard
            footer={
              <PaginationWithPageSize
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            }
          >
            <Table
              aria-label="Lista de contatos"
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            >
              <TableHeader>
                <TableCheckboxHeader
                  isSelected={allSelected}
                  isIndeterminate={someSelected}
                  onChange={handleSelectAll}
                />
                {activeColumns.map(col => (
                  <TableColumn 
                    key={col.id}
                    id={col.id} 
                    allowsSorting={col.id !== 'phone'} 
                    sortDescriptor={sortDescriptor}
          >
            {/* Select All Banner */}
            {allSelected && totalCount > sortedContacts.length && (
              <div className="px-4 py-2 bg-muted/50 border-b text-sm flex items-center justify-center gap-2">
                {selectAllMode === 'all' ? (
                  <>
                    <span>Todos os {totalCount} contatos selecionados.</span>
                    <button 
                      className="text-primary font-medium hover:underline"
                      onClick={handleClearSelection}
                    >
                      Limpar seleção
                    </button>
                  </>
                ) : (
                  <>
                    <span>{sortedContacts.length} contatos desta página selecionados.</span>
                    <button 
                      className="text-primary font-medium hover:underline"
                      onClick={handleSelectAllContacts}
                    >
                      Selecionar todos os {totalCount} contatos
                    </button>
                  </>
                )}
              </div>
            )}
                    {col.label}
                  </TableColumn>
                ))}
                <TableColumn id="actions" className="w-12">
                  <span className="sr-only">Ações</span>
                </TableColumn>
              </TableHeader>
              <TableBody items={sortedContacts}>
                {(contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer"
                    onAction={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <TableCheckboxCell
                      isSelected={selectedIds.includes(contact.id)}
                      onChange={(checked) => handleSelectOne(contact.id, checked)}
                    />
                    {activeColumns.map(col => (
                      <TableCell key={col.id}>
                        {col.id === 'full_name' && (
                          <div className="flex items-center gap-3">
                            <Avatar fallbackText={contact.full_name} size="sm" />
                            <div>
                              <p className="font-medium text-foreground">{contact.full_name}</p>
                              {contact.email && (
                                <p className="text-sm text-muted-foreground">{contact.email}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {col.id === 'lifecycle_stage' && (
                          <BadgeWithDot color={lifecycleColors[contact.lifecycle_stage] || 'gray'}>
                            {getLifecycleLabel(contact.lifecycle_stage)}
                          </BadgeWithDot>
                        )}
                        {col.id === 'phone' && (
                          <span className="text-muted-foreground">
                            {contact.phone ? formatPhoneDisplay(contact.phone) : '—'}
                          </span>
                        )}
                        {col.id === 'company_name' && (
                          <span className="text-muted-foreground">
                            {contact.company_name || '—'}
                          </span>
                        )}
                        {col.id === 'created_at' && (
                          <span className="text-muted-foreground">
                            {contact.created_at
                              ? format(new Date(contact.created_at), 'dd MMM yyyy', { locale: ptBR })
                              : '—'}
                          </span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <TableRowActionsDropdown>
                        <TableRowAction
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/contacts/${contact.id}/edit`);
                          }}
                        >
                          <Edit01 className="w-4 h-4 mr-2" />
                          Editar
                        </TableRowAction>
                        {permissions.canDeleteContacts && (
                          <TableRowAction
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(contact.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash01 className="w-4 h-4 mr-2" />
                            Excluir
                          </TableRowAction>
                        )}
                      </TableRowActionsDropdown>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
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
