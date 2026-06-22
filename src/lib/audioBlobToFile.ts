// Build a File from a recorded audio Blob using its real MIME type.
// Never relabel WebM bytes as .ogg — that produces malformed media files
// (MEDIA_ERR_SRC_NOT_SUPPORTED in stricter browsers like Chrome 145+).
export function audioBlobToFile(blob: Blob, basename = `audio-${Date.now()}`): File {
  const type = (blob.type || 'audio/ogg;codecs=opus').toLowerCase();
  let ext = 'ogg';
  if (type.includes('webm')) ext = 'webm';
  else if (type.includes('ogg')) ext = 'ogg';
  else if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) ext = 'm4a';
  else if (type.includes('mpeg') || type.includes('mp3')) ext = 'mp3';
  else if (type.includes('wav')) ext = 'wav';
  return new File([blob], `${basename}.${ext}`, { type: blob.type || 'audio/ogg;codecs=opus' });
}
