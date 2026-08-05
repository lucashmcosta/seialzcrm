import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, CheckCircle, Globe, Phone, Plus, ShoppingCart, SpinnerGap } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { toast } from 'sonner';

interface UserOption { id: string; full_name: string; email: string }
interface InventoryNumber {
  providerNumberId: string;
  phoneNumber: string;
  friendlyName: string;
  isoCountry: string | null;
  numberKind: string | null;
  capabilities: Record<string, boolean>;
  voiceConfigured: boolean;
  canonical: { id: string; number_type: string; assigned_user_id: string | null; is_active: boolean } | null;
}
interface CatalogNumber {
  phoneNumber: string;
  friendlyName: string;
  isoCountry: string;
  capabilities: Record<string, boolean>;
  addressRequirements: string;
}
interface TwilioAddress { sid: string; friendly_name?: string; customer_name?: string }
interface TwilioBundle { sid: string; friendly_name?: string }

const API_ERRORS: Record<string, string> = {
  telephony_management_required: 'Você não tem permissão para administrar a telefonia.',
  provider_number_without_voice: 'Um dos números selecionados não possui capacidade de voz.',
  user_already_has_active_personal_number: 'Este usuário já possui um número individual ativo.',
  user_has_another_number_purchase_pending: 'Já existe uma compra de número individual pendente para este usuário.',
  approved_address_required: 'Selecione um endereço aprovado na Twilio.',
  approved_regulatory_bundle_required: 'Selecione um bundle regulatório aprovado na Twilio.',
  approved_address_invalid_for_country: 'O endereço selecionado não está aprovado para este país.',
  approved_bundle_invalid_for_number: 'O bundle selecionado não corresponde ao país e tipo do número.',
  approved_regulatory_resource_not_found: 'A Twilio não reconheceu o endereço ou bundle selecionado.',
  phone_number_no_longer_available: 'Este número não está mais disponível. Pesquise novamente.',
  recurring_price_unavailable: 'A Twilio não informou o preço recorrente deste tipo de número. A compra foi bloqueada.',
  purchase_intent_expired_or_processed: 'A cotação expirou. Gere uma nova cotação antes de comprar.',
  purchase_confirmation_mismatch: 'O número ou preço mudou. Gere uma nova cotação.',
  purchase_already_in_progress: 'A compra já está sendo processada. Aguarde alguns instantes e confirme novamente.',
  purchase_reconciliation_unavailable: 'Não foi possível confirmar com a Twilio se a compra terminou. Nenhuma nova compra foi feita; tente novamente mais tarde.',
  number_purchased_recovery_required: 'A Twilio concluiu a compra, mas o CRM ainda está recuperando o cadastro. Confirme novamente para reconciliar sem nova cobrança.',
};

async function invoke(name: string, organizationId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, {
    headers: { 'x-organization-id': organizationId },
    body,
  });
  if (error || data?.error) {
    const code = String(data?.error || '');
    throw new Error(API_ERRORS[code] || data?.detail || code || error?.message || 'Erro na telefonia');
  }
  return data;
}

export function TwilioNumberManagement({ users, onChanged }: { users: UserOption[]; onChanged: () => void }) {
  const { organization } = useOrganization();
  const [inventory, setInventory] = useState<InventoryNumber[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [isoCountry, setIsoCountry] = useState('BR');
  const [numberKind, setNumberKind] = useState('local');
  const [contains, setContains] = useState('');
  const [searching, setSearching] = useState(false);
  const [catalog, setCatalog] = useState<CatalogNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<CatalogNumber | null>(null);
  const [quote, setQuote] = useState<{ monthlyPrice: string | null; currency: string | null } | null>(null);
  const [requiresBundle, setRequiresBundle] = useState(false);
  const [addresses, setAddresses] = useState<TwilioAddress[]>([]);
  const [bundles, setBundles] = useState<TwilioBundle[]>([]);
  const [addressSid, setAddressSid] = useState('none');
  const [bundleSid, setBundleSid] = useState('none');
  const [numberType, setNumberType] = useState<'company' | 'user'>('user');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [missedOwnerId, setMissedOwnerId] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [purchaseQuote, setPurchaseQuote] = useState<{ purchaseIntentId: string; phoneNumber: string; monthlyPrice: string | null; currency: string | null } | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const syncRequired = useMemo(
    () => inventory.filter((number) => number.capabilities.voice === true && (!number.canonical || !number.voiceConfigured)),
    [inventory],
  );

  const loadInventory = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const data = await invoke('telephony-number-inventory', organization.id, { action: 'list' });
      setInventory(data.numbers || []);
      setSelectedInventory((data.numbers || [])
        .filter((number: InventoryNumber) => number.capabilities.voice === true && (!number.canonical || !number.voiceConfigured))
        .map((number: InventoryNumber) => number.providerNumberId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao consultar números Twilio');
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => { void loadInventory(); }, [loadInventory]);
  useEffect(() => {
    if (!assignedUserId && users[0]) setAssignedUserId(users[0].id);
    if (!missedOwnerId && users[0]) setMissedOwnerId(users[0].id);
  }, [users, assignedUserId, missedOwnerId]);

  const syncSelected = async () => {
    if (!organization?.id || !selectedInventory.length) return;
    setSyncing(true);
    try {
      await invoke('telephony-number-inventory', organization.id, { action: 'sync', providerNumberIds: selectedInventory });
      toast.success(`${selectedInventory.length} número(s) sincronizado(s)`);
      await loadInventory();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar números');
    } finally {
      setSyncing(false);
    }
  };

  const searchCatalog = async () => {
    if (!organization?.id) return;
    setSearching(true);
    setSelectedNumber(null);
    setPurchaseQuote(null);
    try {
      const data = await invoke('telephony-number-catalog', organization.id, {
        action: 'search', isoCountry, numberKind, contains: contains || undefined,
      });
      setCatalog(data.numbers || []);
      setQuote(data.quote || null);
      setRequiresBundle(data.regulatory?.requiresBundle === true);
      const regulatory = await invoke('telephony-number-catalog', organization.id, { action: 'regulatory', isoCountry, numberKind });
      setAddresses(regulatory.addresses || []);
      setBundles(regulatory.bundles || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao pesquisar catálogo');
    } finally {
      setSearching(false);
    }
  };

  const createQuote = async () => {
    if (!organization?.id || !selectedNumber || !missedOwnerId || (numberType === 'user' && !assignedUserId)) return;
    setPurchasing(true);
    try {
      const data = await invoke('telephony-number-catalog', organization.id, {
        action: 'quote',
        isoCountry,
        numberKind,
        phoneNumber: selectedNumber.phoneNumber,
        numberType,
        assignedUserId: numberType === 'user' ? assignedUserId : null,
        missedCallOwnerUserId: missedOwnerId,
        friendlyName: friendlyName || selectedNumber.friendlyName,
        addressSid: addressSid === 'none' ? null : addressSid,
        bundleSid: bundleSid === 'none' ? null : bundleSid,
        idempotencyKey: crypto.randomUUID(),
      });
      setPurchaseQuote(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a cotação');
    } finally {
      setPurchasing(false);
    }
  };

  const confirmPurchase = async () => {
    if (!organization?.id || !purchaseQuote) return;
    setPurchasing(true);
    try {
      await invoke('telephony-number-catalog', organization.id, {
        action: 'purchase',
        purchaseIntentId: purchaseQuote.purchaseIntentId,
        confirmPhoneNumber: purchaseQuote.phoneNumber,
        confirmMonthlyPrice: purchaseQuote.monthlyPrice,
      });
      toast.success('Número comprado e configurado com sucesso');
      setBuyOpen(false);
      setCatalog([]);
      setSelectedNumber(null);
      setPurchaseQuote(null);
      await loadInventory();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao comprar número');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Números da conta Twilio</CardTitle>
              <CardDescription>Importe números existentes ou compre uma linha individual para cada comercial.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadInventory()} disabled={loading}>
                {loading ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : <ArrowsClockwise className="mr-2 h-4 w-4" />} Atualizar
              </Button>
              <Button onClick={() => setBuyOpen(true)}><Plus className="mr-2 h-4 w-4" /> Comprar número</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {inventory.length === 0 && !loading ? (
            <Alert><AlertDescription>Nenhum número foi encontrado na conta Twilio conectada.</AlertDescription></Alert>
          ) : inventory.map((number) => (
            <div key={number.providerNumberId} className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                disabled={number.capabilities.voice !== true || (!!number.canonical && number.voiceConfigured)}
                checked={(!!number.canonical && number.voiceConfigured) || selectedInventory.includes(number.providerNumberId)}
                onCheckedChange={(checked) => setSelectedInventory((current) => checked
                  ? [...new Set([...current, number.providerNumberId])]
                  : current.filter((sid) => sid !== number.providerNumberId))}
              />
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{formatPhoneDisplay(number.phoneNumber)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {number.friendlyName} {number.isoCountry ? `· ${number.isoCountry}` : ''} {number.numberKind ? `· ${number.numberKind}` : ''}
                </p>
              </div>
              {number.canonical ? <Badge><CheckCircle className="mr-1 h-3 w-3" /> Sincronizado</Badge> : <Badge variant="outline">Disponível para importar</Badge>}
              {number.capabilities.voice !== true && <Badge variant="secondary">Sem voz</Badge>}
              {!number.voiceConfigured && <Badge variant="destructive">Webhook pendente</Badge>}
            </div>
          ))}
          {syncRequired.length > 0 && (
            <Button onClick={syncSelected} disabled={syncing || !selectedInventory.length} className="w-full">
              {syncing && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />} Sincronizar selecionados
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprar número Twilio</DialogTitle>
            <DialogDescription>A compra é individual e só acontece após a confirmação do número e preço recorrente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>País (ISO)</Label><Input value={isoCountry} maxLength={2} onChange={(event) => setIsoCountry(event.target.value.toUpperCase())} /></div>
              <div className="space-y-2"><Label>Tipo</Label><Select value={numberKind} onValueChange={setNumberKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="mobile">Celular</SelectItem><SelectItem value="toll_free">Gratuito</SelectItem><SelectItem value="national">Nacional</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Contém</Label><Input value={contains} onChange={(event) => setContains(event.target.value)} placeholder="DDD ou sequência" /></div>
            </div>
            <Button variant="outline" className="w-full" onClick={searchCatalog} disabled={searching || isoCountry.length !== 2}>
              {searching ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : <ArrowsClockwise className="mr-2 h-4 w-4" />} Pesquisar números
            </Button>
            {catalog.length > 0 && (
              <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                {catalog.map((number) => (
                  <button type="button" key={number.phoneNumber} onClick={() => { setSelectedNumber(number); setFriendlyName(number.friendlyName); setPurchaseQuote(null); }}
                    className={`rounded-lg border p-3 text-left ${selectedNumber?.phoneNumber === number.phoneNumber ? 'border-primary bg-primary/5' : ''}`}>
                    <p className="font-medium">{formatPhoneDisplay(number.phoneNumber)}</p>
                    <p className="text-xs text-muted-foreground">{quote?.currency || ''} {quote?.monthlyPrice || 'Preço na cotação'} / mês</p>
                  </button>
                ))}
              </div>
            )}
            {selectedNumber && (
              <div className="space-y-4 rounded-xl border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Uso do número</Label><Select value={numberType} onValueChange={(value) => setNumberType(value as 'company' | 'user')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Individual</SelectItem><SelectItem value="company">Corporativo</SelectItem></SelectContent></Select></div>
                  {numberType === 'user' && <div className="space-y-2"><Label>Titular</Label><Select value={assignedUserId} onValueChange={setAssignedUserId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></div>}
                  <div className="space-y-2"><Label>Responsável por chamadas perdidas</Label><Select value={missedOwnerId} onValueChange={setMissedOwnerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Nome no CRM</Label><Input value={friendlyName} onChange={(event) => setFriendlyName(event.target.value)} /></div>
                </div>
                {selectedNumber.addressRequirements !== 'none' && (
                  <div className="space-y-2"><Label>Endereço Twilio aprovado</Label><Select value={addressSid} onValueChange={setAddressSid}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">Selecione um endereço</SelectItem>{addresses.map((address) => <SelectItem key={address.sid} value={address.sid}>{address.friendly_name || address.customer_name || address.sid}</SelectItem>)}</SelectContent></Select></div>
                )}
                {requiresBundle && (
                  <div className="space-y-2"><Label>Bundle regulatório aprovado</Label><Select value={bundleSid} onValueChange={setBundleSid}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">Selecione um bundle</SelectItem>{bundles.map((bundle) => <SelectItem key={bundle.sid} value={bundle.sid}>{bundle.friendly_name || bundle.sid}</SelectItem>)}</SelectContent></Select>{bundles.length === 0 && <p className="text-xs text-destructive">Nenhum bundle aprovado foi encontrado. Regularize o país/tipo no Console Twilio antes da compra.</p>}</div>
                )}
                {!purchaseQuote ? (
                  <Button className="w-full" onClick={createQuote} disabled={purchasing || (requiresBundle && bundleSid === 'none') || (selectedNumber.addressRequirements !== 'none' && addressSid === 'none')}>
                    {purchasing && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />} Gerar cotação final
                  </Button>
                ) : (
                  <Alert className="border-primary/30 bg-primary/5"><ShoppingCart className="h-4 w-4" /><AlertDescription>
                    Confirme a compra de <strong>{formatPhoneDisplay(purchaseQuote.phoneNumber)}</strong> por <strong>{purchaseQuote.currency} {purchaseQuote.monthlyPrice ?? 'preço informado pela Twilio'} / mês</strong>. Impostos e consumo de voz são cobrados separadamente.
                  </AlertDescription></Alert>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)} disabled={purchasing}>Cancelar</Button>
            {purchaseQuote && <Button onClick={confirmPurchase} disabled={purchasing}>{purchasing && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />} Confirmar e comprar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
