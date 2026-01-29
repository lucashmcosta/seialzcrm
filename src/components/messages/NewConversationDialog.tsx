import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/base/avatar/avatar';
import { Loader2, Search, Phone, MessageSquare } from 'lucide-react';

interface Contact {
  id: string;
  full_name: string | null;
  phone: string;
}

// Helper function to validate if a name has real alphanumeric content
const getDisplayName = (contact: Contact): string => {
  const name = contact.full_name?.trim();
  if (!name) return contact.phone;
  
  // Remove non-alphanumeric characters (emojis, zero-width joiners, special chars)
  // Keeps letters, numbers, and spaces from any language
  const cleanName = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (cleanName.length === 0) return contact.phone;
  
  return name;
};

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectContact: (contactId: string, threadId: string) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSelectContact,
}: NewConversationDialogProps) {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts-with-phone', organization?.id, search],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from('contacts')
        .select('id, full_name, phone')
        .eq('organization_id', organization.id)
        .not('phone', 'is', null)
        .is('deleted_at', null)
        .order('full_name')
        .limit(50);

      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: open && !!organization?.id,
  });

  const handleSelect = async (contact: Contact) => {
    if (!organization?.id || selecting) return;

    setSelecting(contact.id);
    try {
      // Check for existing WhatsApp thread
      const { data: existingThread } = await supabase
        .from('message_threads')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('contact_id', contact.id)
        .eq('channel', 'whatsapp')
        .maybeSingle();

      if (existingThread) {
        onSelectContact(contact.id, existingThread.id);
        onOpenChange(false);
        return;
      }

      // Create new thread
      const { data: newThread, error } = await supabase
        .from('message_threads')
        .insert({
          organization_id: organization.id,
          contact_id: contact.id,
          channel: 'whatsapp',
        })
        .select('id')
        .single();

      if (error) throw error;

      onSelectContact(contact.id, newThread.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Error selecting contact:', error);
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {locale === 'pt-BR' ? 'Nova Conversa' : 'New Conversation'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={locale === 'pt-BR' ? 'Buscar contato...' : 'Search contact...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Contact list */}
          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : contacts?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Phone className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {search
                    ? locale === 'pt-BR'
                      ? 'Nenhum contato encontrado'
                      : 'No contacts found'
                    : locale === 'pt-BR'
                    ? 'Nenhum contato com telefone'
                    : 'No contacts with phone'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {contacts?.map((contact) => {
                  const displayName = getDisplayName(contact);
                  const showPhoneAsSecondary = displayName !== contact.phone;
                  
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleSelect(contact)}
                      disabled={selecting !== null}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50"
                    >
                      <Avatar fallbackText={displayName} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{displayName}</p>
                        {showPhoneAsSecondary && (
                          <p className="text-xs text-muted-foreground truncate">{contact.phone}</p>
                        )}
                      </div>
                      {selecting === contact.id && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
