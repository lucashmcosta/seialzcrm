// Phase 1.3D — Inbox-only media upload helper.
// Intentionally duplicates the small upload routine from
// `src/components/whatsapp/WhatsAppChat.tsx` so we do NOT have to touch the
// /messages module while shipping the Inbox composer.

import type { SupabaseClient } from '@supabase/supabase-js';

export type InboxMediaType = 'image' | 'audio' | 'video' | 'document';

export interface InboxUploadResult {
  url: string;
  mediaType: InboxMediaType;
}

export async function inboxUploadMedia(
  supabase: SupabaseClient,
  file: File | Blob,
  organizationId: string,
  filenameHint?: string,
): Promise<InboxUploadResult> {
  const nameSource = (file as File).name || filenameHint || 'upload.bin';
  const fileExt = nameSource.split('.').pop()?.toLowerCase() || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${organizationId}/${fileName}`;

  let mediaType: InboxMediaType = 'document';
  const type = (file as File).type || '';
  if (type.startsWith('image/')) mediaType = 'image';
  else if (type.startsWith('audio/')) mediaType = 'audio';
  else if (type.startsWith('video/')) mediaType = 'video';

  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(filePath, file as any);
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
  return { url: data.publicUrl, mediaType };
}
