// Integrações → E-mail (conexão: a org conecta a PRÓPRIA conta Resend, domínio, remetente, marca) e
// Comunicação → Modelos de e-mail (modelos usados nas réguas). Só administrador.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PencilSimple, Plus, TrashSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineInput } from '@/components/ui/inline-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText } from '@/lib/ui-locale';
import { useTokenOptions } from './useTokenOptions';

interface Settings {
  status: string; auth_method: string | null; key_last4: string | null; webhook_id: string | null; domain_id: string | null; domain_name: string | null;
  domain_status: string | null; from_name: string | null; from_email: string | null; reply_to: string | null;
  brand_color: string | null; logo_url: string | null; footer_text: string | null; last_error: string | null;
  inbound_enabled?: boolean; inbound_address?: string | null;
}
interface Domain { id: string; name: string; status: string; open_tracking?: boolean | null; click_tracking?: boolean | null; tracking_subdomain?: string | null; records?: Array<{ record: string; name: string; type: string; value: string; status?: string; priority?: number }> }
interface EmailTemplate { id: string; name: string; subject: string; body: string; is_marketing: boolean }

const ERRORS: Record<string, string> = {
  invalid_key_format: 'A chave da Resend começa com re_.',
  key_rejected: 'A Resend recusou essa chave. Confira se ela tem acesso total.',
  resend_unavailable: 'A Resend não respondeu. Tente de novo em instantes.',
  not_org_admin: 'Só administradores da organização configuram o e-mail.',
  invalid_domain: 'Domínio inválido. Use algo como mail.suaempresa.com.',
  domain_not_verified: 'O domínio ainda não foi verificado. Configure o DNS e clique em Verificar.',
  invalid_sender: 'Preencha o nome e o endereço do remetente.',
  invalid_reply_to: 'O e-mail de resposta é inválido.',
  invalid_inbound_address: 'Endereço de recebimento inválido.',
  inbound_equals_reply_to: 'O endereço de recebimento não pode ser o mesmo da caixa da equipe.',
  invalid_tracking_subdomain: 'Use só letras, números e hífen no subdomínio de rastreio (ex.: links).',
  sender_not_set: 'Escolha o remetente antes de testar.',
  send_failed: 'A Resend não aceitou o envio.',
  encryption_unavailable: 'Não foi possível proteger a chave agora. Tente de novo.',
};

async function call(orgId: string, action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('email-settings', { body: { organization_id: orgId, action, ...extra } });
  if (error) {
    let code = 'erro';
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? code; } catch { /* sem corpo */ }
    throw new Error(code);
  }
  return data as Record<string, any>;
}
const errText = (e: unknown) => uiText(ERRORS[(e as Error).message] ?? 'Não foi possível concluir.');

function TemplateDialog({ orgId, tpl, onClose, onSaved }: { orgId: string; tpl: EmailTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tpl?.name ?? '');
  const [subject, setSubject] = useState(tpl?.subject ?? '');
  const [body, setBody] = useState(tpl?.body ?? '');
  const [marketing, setMarketing] = useState(tpl?.is_marketing ?? false);
  const [saving, setSaving] = useState(false);
  const tokenOptions = useTokenOptions(orgId);
  const save = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) { toast.error(uiText('Preencha nome, assunto e texto.')); return; }
    setSaving(true);
    const row = { organization_id: orgId, name: name.trim(), subject: subject.trim(), body, is_marketing: marketing, updated_at: new Date().toISOString() };
    const { error } = tpl
      ? await supabase.from('email_templates' as never).update(row as never).eq('id', tpl.id)
      : await supabase.from('email_templates' as never).insert(row as never);
    setSaving(false);
    if (error) { toast.error(uiText('Não foi possível salvar o modelo.')); return; }
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{tpl ? uiText('Editar modelo de e-mail') : uiText('Novo modelo de e-mail')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{uiText('Nome (interno)')}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>{uiText('Assunto')}</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label>{uiText('Texto')}</Label>
              <Select value="" onValueChange={(tok) => setBody((b) => `${b}${tok}`)}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder={uiText('Inserir campo')} /></SelectTrigger>
                <SelectContent>{tokenOptions.map((t) => <SelectItem key={t.token} value={t.token}>{uiText(t.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder={uiText('Escreva o e-mail. Uma linha em branco separa os parágrafos.')} />
            <p className="text-xs text-muted-foreground">{uiText('Se algum campo estiver vazio na hora, o e-mail não sai.')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} />
            {uiText('É marketing (só para quem aceitou; vai com link para sair da lista)')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>{uiText('Cancelar')}</Button>
          <Button disabled={saving} onClick={save}>{saving ? uiText('Salvando...') : uiText('Salvar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailSettings({ section = 'connection' }: { section?: 'connection' | 'templates' }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [openDomain, setOpenDomain] = useState<Domain | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [sender, setSender] = useState({ domain_id: '', from_local: 'contato', from_name: '', reply_to: '' });
  const [brand, setBrand] = useState({ brand_color: '', logo_url: '', footer_text: '' });
  const [testTo, setTestTo] = useState('');
  const [inbound, setInbound] = useState({ enabled: false, address: '' });
  const [tracking, setTracking] = useState({ open: true, click: true, sub: 'links' });
  useEffect(() => {
    if (!openDomain) return;
    setTracking({
      open: openDomain.open_tracking ?? true, click: openDomain.click_tracking ?? true,
      sub: openDomain.tracking_subdomain ?? 'links',
    });
  }, [openDomain?.id, openDomain?.tracking_subdomain]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingTpl, setEditingTpl] = useState<EmailTemplate | 'new' | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['email-settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('organization_email_settings' as never).select('*').eq('organization_id', orgId!).maybeSingle();
      return (data as unknown as Settings | null) ?? null;
    },
  });
  const { data: templates } = useQuery({
    queryKey: ['email-templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('email_templates' as never).select('id, name, subject, body, is_marketing')
        .eq('organization_id', orgId!).is('deleted_at', null).order('name');
      return (data ?? []) as unknown as EmailTemplate[];
    },
  });
  const connected = settings?.status === 'connected';
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('resend');
    if (!r) return;
    const msg: Record<string, string> = {
      connected: 'Resend conectada', denied: 'A conexão foi cancelada na Resend.', expired: 'O pedido de conexão expirou. Tente de novo.',
      invalid: 'Link de volta inválido. Tente de novo.', error: 'A Resend não concluiu a conexão. Tente de novo.',
    };
    if (r === 'connected') toast.success(uiText(msg.connected)); else toast.error(uiText(msg[r] ?? msg.error));
    params.delete('resend');
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
  }, []);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['email-settings', orgId] });

  useEffect(() => {
    if (!settings) return;
    setSender((s) => ({
      domain_id: settings.domain_id ?? s.domain_id,
      from_local: settings.from_email?.split('@')[0] ?? s.from_local,
      from_name: settings.from_name ?? (s.from_name || organization?.name || ''),
      reply_to: settings.reply_to ?? s.reply_to,
    }));
    setBrand({ brand_color: settings.brand_color ?? '', logo_url: settings.logo_url ?? '', footer_text: settings.footer_text ?? '' });
    setInbound({ enabled: !!settings.inbound_enabled, address: settings.inbound_address ?? '' });
  }, [settings, organization?.name]);

  const loadDomains = async () => {
    if (!orgId) return;
    try { setDomains((await call(orgId, 'domains')).domains); } catch (e) { toast.error(errText(e)); }
  };
  useEffect(() => { if (connected) void loadDomains(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  };

  if (!orgId) return null;
  const selectedDomain = domains?.find((d) => d.id === sender.domain_id);

  return (
    <div className="space-y-6">
      {section === 'templates' && !connected && settings !== undefined && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {uiText('O e-mail ainda não está conectado. Conecte em Integrações → E-mail.')}
        </p>
      )}
      {section === 'connection' && <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {uiText('E-mail')}
            {connected
              ? <Badge variant="outline">{uiText('Conectado')} · {settings?.auth_method === 'oauth' ? uiText('pela conta Resend') : `${uiText('chave')} …${settings?.key_last4 ?? ''}`}</Badge>
              : settings?.status === 'error' ? <Badge variant="destructive">{uiText('Reconectar')}</Badge> : <Badge variant="outline">{uiText('Não conectado')}</Badge>}
          </CardTitle>
          <CardDescription>
            {uiText('Os e-mails saem pela conta Resend da sua empresa, com o seu domínio.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings?.last_error && <p className="text-sm text-amber-600 dark:text-amber-400">{uiText(settings.last_error)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!!busy} onClick={() => run('oauth', async () => {
              const r = await call(orgId, 'oauth_start');
              window.location.href = r.url;
            })}>{busy === 'oauth' ? uiText('Abrindo a Resend...') : connected ? uiText('Reconectar com Resend') : uiText('Conectar com Resend')}</Button>
            {connected && (
              <Button variant="outline" disabled={!!busy} onClick={() => run('disconnect', async () => {
                await call(orgId, 'disconnect'); setDomains(null); refresh(); toast.success(uiText('Resend desconectada'));
              })}>{uiText('Desconectar')}</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{uiText('Você entra na Resend (ou cria uma conta grátis), aprova e volta conectado.')}</p>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">{uiText('Conectar com chave (avançado)')}</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input type="password" autoComplete="off" className="max-w-sm" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={connected ? uiText('Trocar a chave (re_...)') : 're_...'} />
            <Button disabled={!apiKey.trim() || !!busy} onClick={() => run('connect', async () => {
              const r = await call(orgId, 'connect', { api_key: apiKey.trim() });
              setApiKey(''); setDomains(r.domains ?? []); refresh();
              toast.success(r.webhook ? uiText('Resend conectada') : uiText('Resend conectada (sem acompanhar entregas)'));
            })}>{busy === 'connect' ? uiText('Conectando...') : uiText('Conectar com a chave')}</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{uiText('Na Resend, em API Keys, crie uma chave com acesso total.')}</p>
          </details>
          <p className="text-xs text-muted-foreground">{uiText('Dica: use um endereço só para envio, como mail.suaempresa.com, e mande poucos e-mails por dia nas 2 primeiras semanas.')}</p>
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiText('Domínio e remetente')}</CardTitle>
            <CardDescription>{uiText('Para não cair no spam, o domínio precisa estar verificado.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(domains ?? []).map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                  <span className="font-medium">{d.name}</span>
                  <Badge variant={d.status === 'verified' ? 'default' : 'outline'} className="text-xs">{d.status === 'verified' ? uiText('verificado') : d.status}</Badge>
                  <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={!!busy}
                    onClick={() => run('domain', async () => setOpenDomain((await call(orgId, 'domain', { domain_id: d.id })).domain))}>{uiText('Ver DNS')}</Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="mail.suaempresa.com" />
                <Button variant="outline" disabled={!newDomain.trim() || !!busy} onClick={() => run('add', async () => {
                  const r = await call(orgId, 'add_domain', { name: newDomain.trim() });
                  setNewDomain(''); setOpenDomain(r.domain); await loadDomains();
                })}>{uiText('Adicionar domínio')}</Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{uiText('Domínio de envio')}</Label>
                <Select value={sender.domain_id || undefined} onValueChange={(v) => setSender({ ...sender, domain_id: v })}>
                  <SelectTrigger><SelectValue placeholder={uiText('Escolha um domínio verificado')} /></SelectTrigger>
                  <SelectContent>{(domains ?? []).filter((d) => d.status === 'verified').map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{uiText('Endereço')}</Label>
                <div className="flex items-center gap-1">
                  <Input value={sender.from_local} onChange={(e) => setSender({ ...sender, from_local: e.target.value })} />
                  <span className="text-sm text-muted-foreground">@{selectedDomain?.name ?? '…'}</span>
                </div>
              </div>
              <div className="space-y-1"><Label>{uiText('Nome do remetente')}</Label><Input value={sender.from_name} onChange={(e) => setSender({ ...sender, from_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>{uiText('Respostas vão para (opcional)')}</Label><Input value={sender.reply_to} onChange={(e) => setSender({ ...sender, reply_to: e.target.value })} placeholder="equipe@suaempresa.com" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!sender.domain_id || !!busy} onClick={() => run('sender', async () => {
                await call(orgId, 'set_sender', sender); refresh(); toast.success(uiText('Remetente salvo'));
              })}>{uiText('Salvar remetente')}</Button>
              {settings?.from_email && <span className="text-sm text-muted-foreground">{uiText('Atual')}: {settings.from_name} &lt;{settings.from_email}&gt;</span>}
            </div>
            {settings?.from_email && (
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={uiText('seu@email.com')} />
                <Button variant="outline" disabled={!testTo.trim() || !!busy} onClick={() => run('test', async () => {
                  await call(orgId, 'send_test', { to: testTo.trim() }); toast.success(uiText('E-mail de teste enviado'));
                })}>{uiText('Enviar teste')}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiText('Respostas por e-mail')}</CardTitle>
            <CardDescription>{uiText('A resposta do lead para a régua, entra na linha do tempo e avisa o responsável. Uma cópia vai para "Respostas vão para".')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{uiText('O endereço está na Resend, em Emails → Receiving. Exemplo: respostas@xxxx.resend.app.')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-sm" value={inbound.address} onChange={(e) => setInbound({ ...inbound, address: e.target.value })} placeholder="respostas@xxxx.resend.app" />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={inbound.enabled} onCheckedChange={(v) => setInbound({ ...inbound, enabled: v === true })} />{uiText('Ligado')}
              </label>
              <Button variant="outline" disabled={!!busy} onClick={() => run('inbound', async () => {
                await call(orgId, 'set_inbound', { enabled: inbound.enabled, inbound_address: inbound.address.trim() });
                refresh(); toast.success(inbound.enabled ? uiText('Respostas por e-mail ligadas') : uiText('Respostas por e-mail desligadas'));
              })}>{uiText('Salvar')}</Button>
            </div>
            {inbound.enabled && !settings?.reply_to && <p className="text-xs text-amber-600 dark:text-amber-400">{uiText('Preencha "Respostas vão para" no remetente para a equipe também receber uma cópia das respostas.')}</p>}
          </CardContent>
        </Card>
      )}

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiText('Marca e rodapé')}</CardTitle>
            <CardDescription>{uiText('Aparecem em todos os e-mails. O rodapé deve ter a razão social e o endereço.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>{uiText('Cor (#RRGGBB)')}</Label><Input value={brand.brand_color} onChange={(e) => setBrand({ ...brand, brand_color: e.target.value })} placeholder="#1F6FEB" /></div>
              <div className="space-y-1"><Label>{uiText('Logo (link https)')}</Label><Input value={brand.logo_url} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} placeholder="https://..." /></div>
            </div>
            <div className="space-y-1"><Label>{uiText('Rodapé')}</Label><Textarea rows={3} value={brand.footer_text} onChange={(e) => setBrand({ ...brand, footer_text: e.target.value })} placeholder={uiText('Empresa LTDA · CNPJ\nRua, número, cidade')} /></div>
            <Button disabled={!!busy} onClick={() => run('brand', async () => {
              if (brand.brand_color && !/^#[0-9a-fA-F]{6}$/.test(brand.brand_color)) throw new Error('cor');
              const { error } = await supabase.from('organization_email_settings' as never).update({
                brand_color: brand.brand_color || null, logo_url: brand.logo_url.trim() || null, footer_text: brand.footer_text.trim() || null,
                updated_at: new Date().toISOString(),
              } as never).eq('organization_id', orgId);
              if (error) throw new Error('erro');
              refresh(); toast.success(uiText('Marca salva'));
            })}>{uiText('Salvar marca')}</Button>
          </CardContent>
        </Card>
      )}

      </>}

      {section === 'templates' && (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{uiText('Modelos de e-mail')}</CardTitle>
            <CardDescription>{uiText('Usados nos passos de e-mail das réguas.')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditingTpl('new')}><Plus className="mr-1 h-4 w-4" />{uiText('Novo modelo')}</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(templates ?? []).length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiText('Nenhum modelo ainda.')}</p>}
          {(templates ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name} {t.is_marketing && <Badge variant="outline" className="ml-1 text-[10px]">{uiText('marketing')}</Badge>}</p>
                <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTpl(t)}><PencilSimple className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => {
                  const { error } = await supabase.from('email_templates' as never).update({ deleted_at: new Date().toISOString() } as never).eq('id', t.id);
                  if (error) toast.error(uiText('Não foi possível excluir.')); else queryClient.invalidateQueries({ queryKey: ['email-templates', orgId] });
                }}><TrashSimple className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      )}

      {openDomain && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpenDomain(null); }}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{uiText('DNS de')} {openDomain.name}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{uiText('Copie estes registros no site onde o seu domínio é administrado (Registro.br, Cloudflare...). Pode levar algumas horas.')}</p>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{uiText('Rastrear aberturas e cliques')}</p>
              <p className="text-xs text-muted-foreground">
                {openDomain.tracking_subdomain
                  ? `${uiText('Endereço de rastreio')}: ${openDomain.tracking_subdomain}.${openDomain.name} · ${uiText('aberturas')} ${openDomain.open_tracking ? uiText('ligado') : uiText('desligado')} · ${uiText('cliques')} ${openDomain.click_tracking ? uiText('ligado') : uiText('desligado')}`
                  : uiText('Mostra quem abriu e clicou. Depois de salvar, aparece mais um registro aqui embaixo para copiar no seu domínio.')}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={tracking.open} onCheckedChange={(v) => setTracking({ ...tracking, open: v === true })} />{uiText('Aberturas')}</label>
                <label className="flex items-center gap-2"><Checkbox checked={tracking.click} onCheckedChange={(v) => setTracking({ ...tracking, click: v === true })} />{uiText('Cliques')}</label>
                <div className="flex items-center gap-1">
                  <InlineInput className="h-8 w-24" value={tracking.sub} disabled={!!openDomain.tracking_subdomain} onChange={(e) => setTracking({ ...tracking, sub: e.target.value })} />
                  <span className="text-xs text-muted-foreground">.{openDomain.name}</span>
                </div>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('tracking', async () => {
                  const r = await call(orgId, 'domain_tracking', { domain_id: openDomain.id, open_tracking: tracking.open, click_tracking: tracking.click, tracking_subdomain: openDomain.tracking_subdomain ?? tracking.sub });
                  setOpenDomain(r.domain);
                  toast.success(uiText('Rastreio salvo. Copie o registro novo no seu domínio e clique em Verificar.'));
                })}>{uiText('Salvar rastreio')}</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{uiText('Esse endereço não pode ser apagado depois, só trocado.')}</p>
            </div>
            <div className="space-y-2">
              {(openDomain.records ?? []).map((r, i) => (
                <div key={i} className="space-y-1 rounded-lg border p-2 text-xs">
                  <div className="flex flex-wrap gap-2"><Badge variant="outline">{r.type}</Badge><span className="font-medium">{r.record}</span>{r.status && <span className="text-muted-foreground">{r.status}</span>}</div>
                  <p><span className="text-muted-foreground">{uiText('Nome')}:</span> <code className="break-all">{r.name}</code></p>
                  <p><span className="text-muted-foreground">{uiText('Valor')}:</span> <code className="break-all">{r.value}</code>{r.priority != null ? ` (${uiText('prioridade')} ${r.priority})` : ''}</p>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDomain(null)}>{uiText('Fechar')}</Button>
              <Button disabled={!!busy} onClick={() => run('verify', async () => {
                const r = await call(orgId, 'verify_domain', { domain_id: openDomain.id });
                setOpenDomain(r.domain); await loadDomains();
                toast[r.domain.status === 'verified' ? 'success' : 'message'](r.domain.status === 'verified' ? uiText('Domínio verificado') : uiText('Ainda não verificado. Pode levar algumas horas.'));
              })}>{uiText('Verificar')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editingTpl && (
        <TemplateDialog orgId={orgId} tpl={editingTpl === 'new' ? null : editingTpl} onClose={() => setEditingTpl(null)}
          onSaved={() => { setEditingTpl(null); queryClient.invalidateQueries({ queryKey: ['email-templates', orgId] }); }} />
      )}
    </div>
  );
}

export function EmailTemplatesSettings() {
  return <EmailSettings section="templates" />;
}

export default EmailSettings;
