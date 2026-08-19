import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';

// Rota temporária de validação do player de áudio (removida após o teste).
export default function DevAudioCheck() {
  const src = 'http://127.0.0.1:8944/test.ogg';
  return (
    <div className="p-8 space-y-6 bg-background">
      <div data-testid="inbound" className="max-w-sm bg-muted p-2 rounded">
        <AudioMessagePlayer src={src} timestamp="10:00" mediaType="audio/ogg" messageId="in-1" threadId="t-1" />
      </div>
      <div data-testid="outbound" className="max-w-sm bg-primary/10 p-2 rounded">
        <AudioMessagePlayer src={src} timestamp="10:01" mediaType="audio/ogg" messageId="out-1" threadId="t-1" />
      </div>
    </div>
  );
}
