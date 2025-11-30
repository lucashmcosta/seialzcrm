import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Download, Trash2, File, FileText, Image, FileSpreadsheet } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  bucket: string;
  created_at: string;
}

interface ContactAttachmentsProps {
  contactId?: string;
  entityId?: string;
  entityType?: string;
}

export function ContactAttachments({ contactId, entityId, entityType }: ContactAttachmentsProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchAttachments();
  }, [contactId, entityId, organization?.id]);

  const fetchAttachments = async () => {
    if (!organization?.id) return;

    try {
      let query = supabase
        .from('attachments')
        .select('*')
        .eq('organization_id', organization.id)
        .is('deleted_at', null);

      if (entityId && entityType) {
        query = query.eq('entity_id', entityId).eq('entity_type', entityType);
      } else if (contactId) {
        query = query.eq('entity_id', contactId).eq('entity_type', 'contact');
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization?.id || !userProfile?.id) return;

    const finalEntityId = entityId || contactId;
    const finalEntityType = entityType || 'contact';
    if (!finalEntityId) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${finalEntityId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create attachment record
      const { error: dbError } = await supabase
        .from('attachments')
        .insert({
          organization_id: organization.id,
          entity_type: finalEntityType,
          entity_id: finalEntityId,
          bucket: 'attachments',
          storage_path: fileName,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by_user_id: userProfile.id,
        });

      if (dbError) throw dbError;

      toast({ description: t('attachments.uploaded') });
      fetchAttachments();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from(attachment.bucket)
        .download(attachment.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!confirm('Delete this attachment?')) return;

    try {
      // Delete from storage
      await supabase.storage
        .from(attachment.bucket)
        .remove([attachment.storage_path]);

      // Soft delete in database
      const { error } = await supabase
        .from('attachments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', attachment.id);

      if (error) throw error;

      toast({ description: t('attachments.deleted') });
      fetchAttachments();
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <File className="w-5 h-5" />;
    if (mimeType.startsWith('image/')) return <Image className="w-5 h-5" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="w-5 h-5" />;
    if (mimeType.includes('text') || mimeType.includes('document')) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

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
          <CardTitle>{t('attachments.title')}</CardTitle>
          <div>
            <Input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />
            <Button size="sm" asChild disabled={uploading}>
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {t('common.upload')}
              </label>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {attachments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No attachments yet</p>
          ) : (
            attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 text-muted-foreground">
                    {getFileIcon(attachment.mime_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size_bytes)} • {formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true, locale: dateLocale })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleDownload(attachment)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(attachment)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
