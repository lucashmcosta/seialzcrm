import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Send, Loader2 } from 'lucide-react';

interface MediaPreviewDialogProps {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onSend: (file: File, caption: string | null) => Promise<void>;
  isLoading?: boolean;
}

export function MediaPreviewDialog({
  file,
  open,
  onClose,
  onSend,
  isLoading = false,
}: MediaPreviewDialogProps) {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  useEffect(() => {
    if (!open) {
      setCaption('');
    }
  }, [open]);

  const handleSend = async () => {
    if (file) {
      await onSend(file, caption.trim() || null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  const isVideo = file?.type.startsWith('video/');
  const isImage = file?.type.startsWith('image/');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Enviar {isVideo ? 'vídeo' : 'imagem'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="relative flex items-center justify-center bg-muted rounded-lg overflow-hidden max-h-[300px]">
            {previewUrl && isImage && (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-[300px] object-contain"
              />
            )}
            {previewUrl && isVideo && (
              <video
                src={previewUrl}
                controls
                className="max-w-full max-h-[300px]"
              />
            )}
          </div>

          {/* Caption input */}
          <div className="space-y-2">
            <Input
              placeholder="Adicionar legenda... (opcional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="w-full"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={isLoading || !file}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
