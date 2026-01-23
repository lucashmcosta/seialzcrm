import { useState, useRef } from 'react';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Upload, 
  Globe, 
  FileText, 
  FileType, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  X
} from 'lucide-react';

interface ImportKnowledgeProps {
  agents: { id: string; name: string }[];
  onSuccess: () => void;
}

const contentTypes = [
  { value: 'faq', label: 'FAQ' },
  { value: 'product', label: 'Produto' },
  { value: 'policy', label: 'Política' },
  { value: 'process', label: 'Processo' },
  { value: 'general', label: 'Geral' },
];

const acceptedFileTypes = [
  '.txt',
  '.md',
  '.pdf',
  '.docx',
];

export function ImportKnowledge({ agents, onSuccess }: ImportKnowledgeProps) {
  const { organization } = useOrganizationContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileType, setFileType] = useState('general');
  const [fileAgentId, setFileAgentId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // URL import state
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlType, setUrlType] = useState('general');
  const [urlAgentId, setUrlAgentId] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (20MB max)
      if (file.size > 20 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Máximo: 20MB');
        return;
      }
      
      setSelectedFile(file);
      // Auto-fill title from filename
      if (!fileTitle) {
        setFileTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedFileTypes.includes(ext)) {
        toast.error(`Tipo de arquivo não suportado. Use: ${acceptedFileTypes.join(', ')}`);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Máximo: 20MB');
        return;
      }
      setSelectedFile(file);
      if (!fileTitle) {
        setFileTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleFileUpload = async () => {
    if (!organization?.id || !selectedFile) return;
    
    setUploading(true);
    setUploadProgress(10);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('organizationId', organization.id);
      formData.append('title', fileTitle || selectedFile.name);
      formData.append('type', fileType);
      if (fileAgentId) {
        formData.append('agentId', fileAgentId);
      }
      
      setUploadProgress(30);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-knowledge`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );
      
      setUploadProgress(70);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao importar arquivo');
      }
      
      const result = await response.json();
      setUploadProgress(100);
      
      toast.success(`Arquivo importado! ${result.chunksCreated} chunks criados.`);
      
      // Reset form
      setSelectedFile(null);
      setFileTitle('');
      setFileType('general');
      setFileAgentId('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onSuccess();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao importar arquivo');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUrlImport = async () => {
    if (!organization?.id || !url) return;
    
    setImportingUrl(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('import-from-url', {
        body: {
          url,
          organizationId: organization.id,
          title: urlTitle || undefined,
          type: urlType,
          agentId: urlAgentId || undefined,
        },
      });
      
      if (error) throw error;
      
      toast.success(`Página importada! ${data.chunksCreated} chunks criados.`);
      
      // Reset form
      setUrl('');
      setUrlTitle('');
      setUrlType('general');
      setUrlAgentId('');
      
      onSuccess();
    } catch (error) {
      console.error('URL import error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao importar URL');
    } finally {
      setImportingUrl(false);
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return <FileText className="h-8 w-8 text-muted-foreground" />;
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <FileType className="h-8 w-8 text-destructive" />;
      case 'docx':
        return <FileType className="h-8 w-8 text-primary" />;
      case 'md':
        return <FileType className="h-8 w-8 text-accent-foreground" />;
      default:
        return <FileText className="h-8 w-8 text-muted-foreground" />;
    }
  };

  return (
    <Tabs defaultValue="file" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="file" className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload Arquivo
        </TabsTrigger>
        <TabsTrigger value="url" className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Importar URL
        </TabsTrigger>
      </TabsList>
      
      {/* File Upload Tab */}
      <TabsContent value="file" className="space-y-4 mt-4">
        {/* Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${selectedFile 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFileTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              {getFileIcon()}
              <div className="text-left">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Arraste arquivo ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground mt-1">
                TXT, PDF (com texto), DOCX, MD • Máx 20MB
              </p>
            </>
          )}
        </div>
        
        {/* PDF Warning */}
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-warning">PDFs</p>
              <p className="text-muted-foreground">
                Apenas PDFs com texto selecionável são aceitos. 
                PDFs escaneados (imagem) não funcionam.
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* File Form */}
        {selectedFile && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  placeholder="Título do conhecimento"
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={fileType} onValueChange={setFileType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contentTypes.map(ct => (
                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Agente (opcional)</Label>
              <Select value={fileAgentId || 'global'} onValueChange={(val) => setFileAgentId(val === 'global' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global - todos os agentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global - todos os agentes</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processando...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
            
            <Button 
              onClick={handleFileUpload} 
              disabled={uploading || !selectedFile}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Importar Arquivo
                </>
              )}
            </Button>
          </div>
        )}
      </TabsContent>
      
      {/* URL Import Tab */}
      <TabsContent value="url" className="space-y-4 mt-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>URL da Página</Label>
            <Input
              type="url"
              placeholder="https://exemplo.com/pagina"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título (opcional)</Label>
              <Input
                placeholder="Será extraído da página"
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={urlType} onValueChange={setUrlType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes.map(ct => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Agente (opcional)</Label>
            <Select value={urlAgentId || 'global'} onValueChange={(val) => setUrlAgentId(val === 'global' ? '' : val)}>
              <SelectTrigger>
                <SelectValue placeholder="Global - todos os agentes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global - todos os agentes</SelectItem>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Card className="border-muted">
            <CardContent className="p-3 flex items-start gap-2">
              <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Importa apenas o conteúdo principal da página (remove menu, rodapé, etc).
                Funciona melhor com páginas de texto como artigos e documentação.
              </p>
            </CardContent>
          </Card>
          
          <Button 
            onClick={handleUrlImport} 
            disabled={importingUrl || !url}
            className="w-full"
          >
            {importingUrl ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" />
                Importar Página
              </>
            )}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
