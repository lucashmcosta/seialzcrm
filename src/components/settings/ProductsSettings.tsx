import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Package, GripVertical } from 'lucide-react';

interface Product {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  product_group: string | null;
  is_active: boolean;
  display_order: number;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}

function ProductDialog({ open, onOpenChange, product, onSuccess }: ProductDialogProps) {
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    product_group: '',
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        slug: product.slug,
        description: product.description || '',
        product_group: product.product_group || '',
        is_active: product.is_active,
        display_order: product.display_order,
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        description: '',
        product_group: '',
        is_active: true,
        display_order: 0,
      });
    }
  }, [product, open]);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setFormData(prev => ({ ...prev, name, slug: prev.slug || slug }));
  };

  const handleSubmit = async () => {
    if (!organization || !formData.name || !formData.slug) {
      toast.error('Nome e slug são obrigatórios');
      return;
    }

    setLoading(true);
    try {
      if (product) {
        // Update
        const { error } = await supabase
          .from('products')
          .update({
            name: formData.name,
            slug: formData.slug,
            description: formData.description || null,
            product_group: formData.product_group || null,
            is_active: formData.is_active,
            display_order: formData.display_order,
          })
          .eq('id', product.id);

        if (error) throw error;
        toast.success('Produto atualizado');
      } else {
        // Create
        const { error } = await supabase
          .from('products')
          .insert({
            organization_id: organization.id,
            name: formData.name,
            slug: formData.slug,
            description: formData.description || null,
            product_group: formData.product_group || null,
            is_active: formData.is_active,
            display_order: formData.display_order,
          });

        if (error) throw error;
        toast.success('Produto criado');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving product:', error);
      if (error.code === '23505') {
        toast.error('Já existe um produto com este slug');
      } else {
        toast.error('Erro ao salvar produto');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          <DialogDescription>
            Produtos permitem organizar o conhecimento por serviço ou oferta
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex: EB2-NIW"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
              placeholder="Ex: eb2-niw"
            />
            <p className="text-xs text-muted-foreground">
              Identificador único (apenas letras, números e hífens)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Descrição breve do produto..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_group">Grupo</Label>
            <Input
              id="product_group"
              value={formData.product_group}
              onChange={(e) => setFormData(prev => ({ ...prev, product_group: e.target.value }))}
              placeholder="Ex: Vistos de Trabalho"
            />
            <p className="text-xs text-muted-foreground">
              Agrupe produtos relacionados
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Ativo</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsSettings() {
  const { organization } = useOrganization();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', organization.id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [organization]);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Tem certeza que deseja excluir "${product.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;
      toast.success('Produto excluído');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Erro ao excluir produto');
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;
      toast.success(product.is_active ? 'Produto desativado' : 'Produto ativado');
      fetchProducts();
    } catch (error) {
      console.error('Error toggling product:', error);
      toast.error('Erro ao atualizar produto');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Produtos & Serviços
            </CardTitle>
            <CardDescription>
              Organize seu conhecimento por produto ou serviço
            </CardDescription>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum produto cadastrado</h3>
              <p className="text-muted-foreground mb-4">
                Crie produtos para organizar seu conhecimento por serviço
              </p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro produto
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {product.slug}
                    </TableCell>
                    <TableCell>{product.product_group || '-'}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={product.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => handleToggleActive(product)}
                      >
                        {product.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
        onSuccess={fetchProducts}
      />
    </div>
  );
}
