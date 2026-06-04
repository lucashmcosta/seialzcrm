import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import type { DocumentType } from './useDocumentTypes';

export type DocSubmissionStatus = 'pending' | 'uploaded' | 'approved' | 'rejected';

export interface AttachmentLite {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  bucket: string;
  created_at: string;
}

export interface DocumentSubmission {
  id: string;
  organization_id: string;
  contact_id: string;
  document_type_id: string;
  attachment_id: string;
  status: 'uploaded' | 'approved' | 'rejected';
  uploaded_by_user_id: string;
  uploaded_at: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChecklistRow {
  type: DocumentType;
  submission: DocumentSubmission | null;
  attachment: AttachmentLite | null;
  status: DocSubmissionStatus;
}

export function useContactDocuments(contactId: string | undefined | null) {
  const { organization, userProfile } = useOrganization();
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);

  const fetchData = useCallback(async () => {
    if (!organization?.id || !contactId) return;
    setLoading(true);

    const [typesRes, subsRes, canReviewRes] = await Promise.all([
      supabase
        .from('document_types')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('document_submissions')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .is('deleted_at', null),
      supabase.rpc('can_review_contact_documents', { _contact_id: contactId }),
    ]);

    setCanReview(Boolean(canReviewRes.data));

    const types = (typesRes.data as DocumentType[]) || [];
    const subs = (subsRes.data as DocumentSubmission[]) || [];

    const attIds = subs.map((s) => s.attachment_id);
    let atts: AttachmentLite[] = [];
    if (attIds.length) {
      const { data: aData } = await supabase
        .from('attachments')
        .select('id,file_name,mime_type,size_bytes,storage_path,bucket,created_at')
        .in('id', attIds)
        .is('deleted_at', null);
      atts = (aData as AttachmentLite[]) || [];
    }
    const attMap = new Map(atts.map((a) => [a.id, a]));
    const subMap = new Map(subs.map((s) => [s.document_type_id, s]));

    const built: ChecklistRow[] = types.map((t) => {
      const sub = subMap.get(t.id) || null;
      const att = sub ? attMap.get(sub.attachment_id) || null : null;
      const status: DocSubmissionStatus = sub ? sub.status : 'pending';
      return { type: t, submission: sub, attachment: att, status };
    });

    setRows(built);
    setLoading(false);
  }, [organization?.id, contactId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!organization?.id || !contactId) return;
    const ch = supabase
      .channel(`contact_docs:${contactId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_submissions', filter: `contact_id=eq.${contactId}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_types', filter: `organization_id=eq.${organization.id}` },
        () => fetchData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [organization?.id, contactId, fetchData]);

  const uploadFile = async (file: File): Promise<{ attachmentId: string; }> => {
    if (!organization?.id || !contactId || !userProfile?.id) throw new Error('missing context');
    const ext = file.name.split('.').pop();
    const path = `${organization.id}/contact_document/${contactId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
    if (upErr) throw upErr;
    const { data: ins, error: insErr } = await supabase
      .from('attachments')
      .insert({
        organization_id: organization.id,
        entity_type: 'contact_document',
        entity_id: contactId,
        bucket: 'attachments',
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by_user_id: userProfile.id,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return { attachmentId: ins.id };
  };

  const uploadForType = async (typeId: string, file: File, existingSubmissionId?: string | null) => {
    if (!organization?.id || !contactId || !userProfile?.id) throw new Error('missing context');
    const { attachmentId } = await uploadFile(file);
    if (existingSubmissionId) {
      const { error } = await supabase
        .from('document_submissions')
        .update({
          attachment_id: attachmentId,
          status: 'uploaded',
          uploaded_by_user_id: userProfile.id,
          uploaded_at: new Date().toISOString(),
          reviewed_by_user_id: null,
          reviewed_at: null,
          rejection_reason: null,
        })
        .eq('id', existingSubmissionId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('document_submissions').insert({
        organization_id: organization.id,
        contact_id: contactId,
        document_type_id: typeId,
        attachment_id: attachmentId,
        status: 'uploaded',
        uploaded_by_user_id: userProfile.id,
        uploaded_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    await fetchData();
  };

  const approve = async (submissionId: string) => {
    if (!userProfile?.id) throw new Error('no user');
    const { error } = await supabase
      .from('document_submissions')
      .update({
        status: 'approved',
        reviewed_by_user_id: userProfile.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', submissionId);
    if (error) throw error;
    await fetchData();
  };

  const reject = async (submissionId: string, reason: string) => {
    if (!userProfile?.id) throw new Error('no user');
    const { error } = await supabase
      .from('document_submissions')
      .update({
        status: 'rejected',
        reviewed_by_user_id: userProfile.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', submissionId);
    if (error) throw error;
    await fetchData();
  };

  const remove = async (submission: DocumentSubmission) => {
    const now = new Date().toISOString();
    const { error: sErr } = await supabase
      .from('document_submissions')
      .update({ deleted_at: now })
      .eq('id', submission.id);
    if (sErr) throw sErr;
    const { error: aErr } = await supabase
      .from('attachments')
      .update({ deleted_at: now })
      .eq('id', submission.attachment_id);
    if (aErr) throw aErr;
    await fetchData();
  };

  const downloadAttachment = async (att: AttachmentLite) => {
    const { data, error } = await supabase.storage.from(att.bucket).download(att.storage_path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    rows,
    loading,
    canReview,
    refetch: fetchData,
    uploadForType,
    approve,
    reject,
    remove,
    downloadAttachment,
  };
}
