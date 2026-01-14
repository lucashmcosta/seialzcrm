import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Bot, Clock, MessageSquare, Settings2, AlertCircle, Loader2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface WorkingHoursSchedule {
  [day: string]: { start: string; end: string } | null;
}

interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: WorkingHoursSchedule;
}

interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  agent_type: string;
  is_enabled: boolean;
  tone: string;
  goal: string;
  custom_instructions: string | null;
  greeting_message: string | null;
  working_hours: WorkingHours;
  out_of_hours_message: string | null;
  max_messages_per_conversation: number;
}

const DEFAULT_WORKING_HOURS: WorkingHours = {
  enabled: false,
  timezone: 'America/Sao_Paulo',
  schedule: {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: null,
    sunday: null,
  },
};

const DAYS = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const TONES = [
  { value: 'professional', label: 'Profissional', description: 'Formal mas acolhedor' },
  { value: 'friendly', label: 'Amigável', description: 'Casual e simpático' },
  { value: 'formal', label: 'Formal', description: 'Muito formal e corporativo' },
  { value: 'casual', label: 'Casual', description: 'Descontraído, usa emojis' },
  { value: 'technical', label: 'Técnico', description: 'Direto e objetivo' },
];

const GOALS = [
  { value: 'qualify_lead', label: 'Qualificar leads', description: 'Faz perguntas para entender necessidades' },
  { value: 'schedule_meeting', label: 'Agendar reunião', description: 'Foca em marcar demonstrações' },
  { value: 'answer_questions', label: 'Responder dúvidas', description: 'Tira dúvidas sobre produtos' },
  { value: 'support', label: 'Suporte', description: 'Ajuda a resolver problemas' },
  { value: 'custom', label: 'Personalizado', description: 'Usa apenas suas instruções' },
];

export function AIAgentSettings() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [hasWhatsApp, setHasWhatsApp] = useState(false);
  const [hasAI, setHasAI] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: 'Agente SDR',
    is_enabled: false,
    tone: 'professional',
    goal: 'qualify_lead',
    custom_instructions: '',
    greeting_message: 'Olá! Sou o assistente virtual da empresa. Como posso ajudar?',
    working_hours: DEFAULT_WORKING_HOURS,
    out_of_hours_message: 'Obrigado pela mensagem! Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Retornaremos em breve!',
    max_messages_per_conversation: 10,
  });

  useEffect(() => {
    if (organization?.id) {
      fetchAgent();
      checkIntegrations();
    }
  }, [organization?.id]);

  const fetchAgent = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('organization_id', organization!.id)
        .eq('agent_type', 'sdr')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAgent(data as unknown as AIAgent);
        setFormData({
          name: data.name,
          is_enabled: data.is_enabled,
          tone: data.tone,
          goal: data.goal,
          custom_instructions: data.custom_instructions || '',
          greeting_message: data.greeting_message || '',
          working_hours: (data.working_hours as unknown as WorkingHours) || DEFAULT_WORKING_HOURS,
          out_of_hours_message: data.out_of_hours_message || '',
          max_messages_per_conversation: data.max_messages_per_conversation,
        });
      }
    } catch (error) {
      console.error('Error fetching agent:', error);
      toast.error('Erro ao carregar configurações do agente');
    } finally {
      setLoading(false);
    }
  };

  const checkIntegrations = async () => {
    try {
      const { data: integrations } = await supabase
        .from('organization_integrations')
        .select('integration:admin_integrations!inner(slug)')
        .eq('organization_id', organization!.id)
        .eq('is_enabled', true);

      if (integrations) {
        const slugs = integrations.map((i: any) => i.integration?.slug);
        setHasWhatsApp(slugs.includes('twilio-whatsapp'));
        setHasAI(slugs.includes('claude-ai') || slugs.includes('openai-gpt'));
      }
    } catch (error) {
      console.error('Error checking integrations:', error);
    }
  };

  const handleSave = async () => {
    if (!organization?.id) return;

    setSaving(true);
    try {
      const payload = {
        organization_id: organization.id,
        agent_type: 'sdr',
        name: formData.name,
        is_enabled: formData.is_enabled,
        tone: formData.tone,
        goal: formData.goal,
        custom_instructions: formData.custom_instructions || null,
        greeting_message: formData.greeting_message || null,
        working_hours: formData.working_hours as unknown as Json,
        out_of_hours_message: formData.out_of_hours_message || null,
        max_messages_per_conversation: formData.max_messages_per_conversation,
      };

      if (agent?.id) {
        const { error } = await supabase
          .from('ai_agents')
          .update(payload)
          .eq('id', agent.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('ai_agents')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setAgent(data as unknown as AIAgent);
      }

      toast.success('Configurações salvas com sucesso!');
    } catch (error: any) {
      console.error('Error saving agent:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const updateWorkingHours = (day: string, field: 'start' | 'end', value: string) => {
    setFormData(prev => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        schedule: {
          ...prev.working_hours.schedule,
          [day]: prev.working_hours.schedule[day]
            ? { ...prev.working_hours.schedule[day]!, [field]: value }
            : { start: '09:00', end: '18:00', [field]: value },
        },
      },
    }));
  };

  const toggleDayEnabled = (day: string) => {
    setFormData(prev => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        schedule: {
          ...prev.working_hours.schedule,
          [day]: prev.working_hours.schedule[day] 
            ? null 
            : { start: '09:00', end: '18:00' },
        },
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const missingIntegrations = !hasWhatsApp || !hasAI;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Agente SDR</h2>
            <p className="text-sm text-muted-foreground">
              Configure seu assistente de vendas automatizado
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {agent?.is_enabled && (
            <Badge variant="default" className="bg-green-500">
              Ativo
            </Badge>
          )}
          <Switch
            checked={formData.is_enabled}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_enabled: checked }))}
            disabled={missingIntegrations}
          />
        </div>
      </div>

      {/* Prerequisites Alert */}
      {missingIntegrations && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Para usar o Agente SDR, você precisa configurar:
            {!hasWhatsApp && <span className="font-medium"> WhatsApp (Twilio)</span>}
            {!hasWhatsApp && !hasAI && ' e'}
            {!hasAI && <span className="font-medium"> IA (Claude ou ChatGPT)</span>}
            {' '}em Integrações.
          </AlertDescription>
        </Alert>
      )}

      {/* Basic Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configurações Básicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Agente</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Assistente Maria"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Tom da Conversa</Label>
              <Select
                value={formData.tone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tone: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((tone) => (
                    <SelectItem key={tone.value} value={tone.value}>
                      <div>
                        <span className="font-medium">{tone.label}</span>
                        <span className="text-muted-foreground ml-2">- {tone.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Objetivo Principal</Label>
            <Select
              value={formData.goal}
              onValueChange={(value) => setFormData(prev => ({ ...prev, goal: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((goal) => (
                  <SelectItem key={goal.value} value={goal.value}>
                    <div>
                      <span className="font-medium">{goal.label}</span>
                      <span className="text-muted-foreground ml-2">- {goal.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_instructions">Instruções Personalizadas</Label>
            <Textarea
              id="custom_instructions"
              value={formData.custom_instructions}
              onChange={(e) => setFormData(prev => ({ ...prev, custom_instructions: e.target.value }))}
              placeholder="Ex: Você trabalha para a TechCorp. Nossos produtos são: CRM Pro e ERP Suite. Sempre mencione que oferecemos 14 dias grátis..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Adicione informações sobre sua empresa, produtos, regras específicas, etc.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting_message">Mensagem de Boas-Vindas</Label>
            <Textarea
              id="greeting_message"
              value={formData.greeting_message}
              onChange={(e) => setFormData(prev => ({ ...prev, greeting_message: e.target.value }))}
              placeholder="Olá! Sou o assistente virtual da empresa. Como posso ajudar?"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Primeira mensagem que o agente enviará (opcional)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Working Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horário de Funcionamento
            </CardTitle>
            <Switch
              checked={formData.working_hours.enabled}
              onCheckedChange={(checked) => 
                setFormData(prev => ({
                  ...prev,
                  working_hours: { ...prev.working_hours, enabled: checked }
                }))
              }
            />
          </div>
          <CardDescription>
            Defina quando o agente deve responder automaticamente
          </CardDescription>
        </CardHeader>
        {formData.working_hours.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fuso Horário</Label>
              <Select
                value={formData.working_hours.timezone}
                onValueChange={(value) =>
                  setFormData(prev => ({
                    ...prev,
                    working_hours: { ...prev.working_hours, timezone: value }
                  }))
                }
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                  <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                  <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              {DAYS.map((day) => {
                const schedule = formData.working_hours.schedule[day.key];
                const isEnabled = schedule !== null;

                return (
                  <div key={day.key} className="flex items-center gap-4">
                    <div className="w-24 flex items-center gap-2">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleDayEnabled(day.key)}
                      />
                      <span className={isEnabled ? 'font-medium' : 'text-muted-foreground'}>
                        {day.label}
                      </span>
                    </div>
                    {isEnabled && schedule && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={schedule.start}
                          onChange={(e) => updateWorkingHours(day.key, 'start', e.target.value)}
                          className="w-32"
                        />
                        <span className="text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={schedule.end}
                          onChange={(e) => updateWorkingHours(day.key, 'end', e.target.value)}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="out_of_hours">Mensagem Fora do Horário</Label>
              <Textarea
                id="out_of_hours"
                value={formData.out_of_hours_message}
                onChange={(e) => setFormData(prev => ({ ...prev, out_of_hours_message: e.target.value }))}
                placeholder="Obrigado pela mensagem! Nosso horário de atendimento é..."
                rows={2}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Limites
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max_messages">Máximo de mensagens por conversa</Label>
            <Select
              value={formData.max_messages_per_conversation.toString()}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, max_messages_per_conversation: parseInt(value) }))
              }
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 mensagens</SelectItem>
                <SelectItem value="10">10 mensagens</SelectItem>
                <SelectItem value="15">15 mensagens</SelectItem>
                <SelectItem value="20">20 mensagens</SelectItem>
                <SelectItem value="50">50 mensagens</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Após este limite, o agente para de responder automaticamente para que um humano assuma
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchAgent} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving || missingIntegrations}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar'
          )}
        </Button>
      </div>
    </div>
  );
}
