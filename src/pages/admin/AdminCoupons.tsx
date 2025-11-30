import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Power, PowerOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CreateCouponDialog } from '@/components/admin/CreateCouponDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  redemption_count?: number;
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchCoupons = async () => {
    try {
      const { data: couponsData, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar contagem de resgates
      const couponsWithCounts = await Promise.all(
        (couponsData || []).map(async (coupon) => {
          const { count } = await supabase
            .from('coupon_redemptions')
            .select('*', { count: 'exact', head: true })
            .eq('coupon_id', coupon.id);

          return { 
            ...coupon, 
            discount_type: coupon.discount_type as 'percentage' | 'fixed',
            redemption_count: count || 0 
          };
        })
      );

      setCoupons(couponsWithCounts);
    } catch (error: any) {
      console.error('Error fetching coupons:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar cupons.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ is_active: !coupon.is_active })
        .eq('id', coupon.id);

      if (error) throw error;

      toast({
        title: 'Cupom atualizado',
        description: `Cupom ${coupon.is_active ? 'desativado' : 'ativado'} com sucesso.`,
      });

      fetchCoupons();
    } catch (error: any) {
      console.error('Error toggling coupon:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar cupom.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Cupons de Desconto</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cupom
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">Carregando cupons...</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum cupom cadastrado
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono font-bold">
                      {coupon.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {coupon.discount_type === 'percentage' ? '%' : 'R$'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {coupon.discount_type === 'percentage'
                        ? `${coupon.discount_value}%`
                        : `R$ ${coupon.discount_value}`}
                    </TableCell>
                    <TableCell>
                      {coupon.redemption_count}/{coupon.max_uses || '∞'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {coupon.valid_until
                        ? format(new Date(coupon.valid_until), 'dd/MM/yyyy')
                        : 'Sem limite'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={coupon.is_active ? 'default' : 'secondary'}>
                        {coupon.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(coupon)}
                      >
                        {coupon.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <CreateCouponDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={fetchCoupons}
        />
      </div>
    </AdminLayout>
  );
}
