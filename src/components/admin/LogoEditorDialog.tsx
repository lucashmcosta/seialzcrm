import { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Link, Image as ImageIcon, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LogoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLogoUrl?: string;
  onSave: (newLogoUrl: string) => void;
  integrationSlug?: string;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function LogoEditorDialog({
  open,
  onOpenChange,
  currentLogoUrl,
  onSave,
  integrationSlug = 'logo',
}: LogoEditorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result as string);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const loadImageFromUrl = () => {
    if (!imageUrl) return;
    setImageSrc(imageUrl);
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const getCroppedImg = async (): Promise<Blob | null> => {
    if (!imgRef.current || !completedCrop) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const outputSize = 256; // Output logo size
    canvas.width = outputSize;
    canvas.height = outputSize;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      outputSize,
      outputSize
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1);
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const blob = await getCroppedImg();
      if (!blob) {
        toast.error('Erro ao processar imagem');
        return;
      }

      const fileName = `${integrationSlug}-${Date.now()}.png`;
      
      const { data, error } = await supabase.storage
        .from('integration-logos')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('integration-logos')
        .getPublicUrl(data.path);

      onSave(urlData.publicUrl);
      toast.success('Logo salva com sucesso!');
      handleClose();
    } catch (error: any) {
      toast.error('Erro ao salvar logo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setImageSrc(null);
    setImageUrl('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    onOpenChange(false);
  };

  const handleRemoveLogo = () => {
    onSave('');
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Editar Logo</DialogTitle>
          <DialogDescription>
            Faça upload ou cole uma URL. Recorte a imagem para garantir que fique perfeita.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload de Arquivo
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link className="w-4 h-4" />
              URL Externa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onSelectFile}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 border-dashed"
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6" />
                  <span>Clique para selecionar uma imagem</span>
                </div>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                />
                <Button type="button" onClick={loadImageFromUrl}>
                  Carregar
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {imageSrc && (
          <div className="space-y-4 mt-4">
            <Label>Recorte a área desejada:</Label>
            <div className="flex justify-center bg-muted rounded-lg p-4 max-h-[300px] overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop={false}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Imagem para recorte"
                  onLoad={onImageLoad}
                  style={{ maxHeight: '250px' }}
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            </div>

            {completedCrop && (
              <div className="space-y-2">
                <Label>Preview (como os clientes verão):</Label>
                <div className="flex items-center gap-6 p-4 bg-muted rounded-lg">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-background p-1">
                      <canvas
                        id="preview-48"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">48px</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-background p-1">
                      <canvas
                        id="preview-40"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">40px</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-background p-1">
                      <canvas
                        id="preview-32"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">32px</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!imageSrc && currentLogoUrl && (
          <div className="space-y-2 mt-4">
            <Label>Logo atual:</Label>
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <img
                src={currentLogoUrl}
                alt="Logo atual"
                className="w-16 h-16 rounded-lg object-contain bg-background p-2"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemoveLogo}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover Logo
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !completedCrop}
          >
            {loading ? 'Salvando...' : 'Salvar Logo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
