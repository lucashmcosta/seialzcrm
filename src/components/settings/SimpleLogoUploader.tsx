import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Upload, Link, Trash2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SimpleLogoUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLogoUrl: string;
  currentSize: number;
  onSave: (logoUrl: string, size: number) => Promise<void>;
  organizationSlug: string;
}

export function SimpleLogoUploader({
  open,
  onOpenChange,
  currentLogoUrl,
  currentSize,
  onSave,
  organizationSlug,
}: SimpleLogoUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentLogoUrl);
  const [logoSize, setLogoSize] = useState(currentSize);
  const [urlInput, setUrlInput] = useState('');
  const [activeTab, setActiveTab] = useState<string>('upload');

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPreviewUrl(currentLogoUrl);
      setLogoSize(currentSize);
      setUrlInput('');
    }
    onOpenChange(isOpen);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Por favor, selecione uma imagem válida.',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'A imagem deve ter no máximo 2MB.',
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${organizationSlug}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('organization-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('organization-logos')
        .getPublicUrl(filePath);

      setPreviewUrl(publicUrl);
      toast({
        title: 'Upload concluído',
        description: 'Imagem carregada com sucesso.',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro no upload',
        description: 'Não foi possível fazer o upload da imagem.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    
    // Basic URL validation
    try {
      new URL(urlInput);
      setPreviewUrl(urlInput);
    } catch {
      toast({
        variant: 'destructive',
        title: 'URL inválida',
        description: 'Por favor, insira uma URL válida.',
      });
    }
  };

  const handleRemoveLogo = () => {
    setPreviewUrl('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(previewUrl, logoSize);
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Logo da Organização</DialogTitle>
          <DialogDescription>
            Faça upload de uma imagem ou cole uma URL. Ajuste o tamanho para a sidebar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url">
                <Link className="w-4 h-4 mr-2" />
                URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-20"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Clique para selecionar uma imagem
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="url" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="https://exemplo.com/logo.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Button type="button" onClick={handleUrlSubmit}>
                  Aplicar
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview na Sidebar</Label>
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg min-h-[80px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview do logo"
                  style={{ height: logoSize }}
                  className="object-contain"
                  onError={() => {
                    toast({
                      variant: 'destructive',
                      title: 'Erro ao carregar imagem',
                      description: 'A URL da imagem não é válida.',
                    });
                    setPreviewUrl('');
                  }}
                />
              ) : (
                <div 
                  className="bg-primary rounded-lg flex items-center justify-center"
                  style={{ width: logoSize, height: logoSize }}
                >
                  <ImageIcon className="w-1/2 h-1/2 text-primary-foreground" />
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {logoSize}px de altura
              </span>
            </div>
          </div>

          {/* Size Slider */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Tamanho na Sidebar</Label>
              <span className="text-sm text-muted-foreground">{logoSize}px</span>
            </div>
            <Slider
              value={[logoSize]}
              onValueChange={([value]) => setLogoSize(value)}
              min={24}
              max={64}
              step={4}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>24px</span>
              <span>64px</span>
            </div>
          </div>

          {previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveLogo}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remover logo
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
