import { useState } from 'react';
import { motion } from 'framer-motion';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';
import { toast } from '@/hooks/use-toast';
import {
  Target, ArrowsClockwise, ChartLineUp, PhoneCall, Robot, ChatCircleText,
  UsersThree, ChartBar, UserCheck, MagnifyingGlass, GearSix, Lightning, ArrowRight,
} from '@phosphor-icons/react';

/* ── Animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function SectionTag({ children }: { children: string }) {
  return (
    <span className="inline-block text-xs tracking-[4px] uppercase text-[hsl(150,100%,50%)] font-['Michroma'] mb-4">
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   LANDING PAGE
   ══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', budget: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      toast({ title: 'Recebemos seu contato!', description: 'Nosso time entrará em contato em até 24h.' });
      setForm({ name: '', company: '', email: '', phone: '', budget: '' });
      setSubmitting(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)] text-white overflow-x-hidden">
      <LandingNavbar />

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 md:pt-44 md:pb-36 auth-grid-pattern">
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// Sales as a Service</SectionTag>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-['Michroma'] text-4xl md:text-6xl lg:text-7xl leading-tight tracking-tight mb-6"
            >
              Sua empresa vende.{' '}
              <span className="text-[hsl(150,100%,50%)]">A gente faz vender mais.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl text-[hsl(0,0%,60%)] max-w-3xl mx-auto mb-10 font-['Outfit'] leading-relaxed"
            >
              Marketing, vendas e operação comercial numa única plataforma com IA. Dados de marketing
              otimizam vendas. Dados de vendas otimizam marketing.{' '}
              <span className="text-white font-medium">Um loop que só cresce.</span>
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#cta"
                className="auth-btn-primary px-8 py-4 rounded-full text-base font-bold font-['Outfit'] transition-all hover:shadow-[0_0_30px_hsl(150,100%,50%,0.35)] hover:scale-105"
              >
                AGENDAR DIAGNÓSTICO GRATUITO
              </a>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-4 text-sm text-[hsl(0,0%,40%)] font-['Outfit']">
              Análise gratuita do seu funil · 30 minutos · Sem compromisso
            </motion.p>
          </motion.div>
        </div>
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(150,100%,50%,0.06)_0%,transparent_70%)] pointer-events-none" />
      </section>

      {/* ─── O PROBLEMA ─── */}
      <section id="problema" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// O Problema</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-8">
              Marketing culpa vendas. Vendas culpa marketing.{' '}
              <span className="text-[hsl(150,100%,50%)]">Ninguém olha pro que importa: receita.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-6 text-[hsl(0,0%,60%)] font-['Outfit'] text-lg leading-relaxed">
              <p>
                Sua empresa tem um gestor de tráfego que mede CPL. Um time comercial que mede conversão.
                E uma planilha que tenta juntar os dois. O resultado? Marketing diz que entregou 500 leads.
                Vendas diz que os leads são ruins. E você não sabe quem tem razão — porque os dados não se conectam.
              </p>
              <p className="text-white font-medium">
                O problema não é falta de leads nem falta de vendedores. É falta de uma operação integrada
                onde marketing e vendas são um sistema só.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── A SOLUÇÃO ─── */}
      <section id="solucao" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// A Solução</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-6">
              Sales as a Service —{' '}
              <span className="text-[hsl(150,100%,50%)]">marketing e vendas conectados por IA</span> numa assinatura.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Outfit'] text-lg leading-relaxed mb-12 max-w-4xl">
              O Seialz elimina a separação entre marketing e vendas. Uma plataforma, um funil, uma fonte de verdade.
              Os dados de vendas voltam pro marketing pra otimizar campanhas. Os dados de marketing alimentam vendas
              com contexto completo. Sem gestor de tráfego isolado. Sem CRM desconectado. Sem planilha no meio.
            </motion.p>

            {/* Loop visual */}
            <motion.div variants={fadeUp} className="mb-16">
              <h3 className="font-['Michroma'] text-lg text-[hsl(150,100%,50%)] mb-8 text-center">O loop que muda tudo</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  { step: '01', text: 'Marketing roda campanha → lead entra no Seialz automaticamente' },
                  { step: '02', text: 'Vendas trabalha o lead → cada interação é rastreada' },
                  { step: '03', text: 'Lead fecha (ou não) → o resultado volta pro marketing' },
                  { step: '04', text: 'Marketing otimiza → melhores leads chegam → vendas converte mais' },
                  { step: '05', text: 'O ciclo se repete e fica mais inteligente a cada rodada' },
                ].map((item) => (
                  <div key={item.step} className="relative bg-[hsl(240,10%,8%)] border border-[hsl(150,100%,50%)]/15 rounded-2xl p-5 text-center">
                    <span className="text-[hsl(150,100%,50%)] font-['Michroma'] text-2xl block mb-3">{item.step}</span>
                    <p className="text-sm text-[hsl(0,0%,60%)] font-['Outfit']">{item.text}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 3 Pilares */}
            <motion.div variants={fadeUp}>
              <h3 className="font-['Michroma'] text-lg mb-8 text-center">3 Pilares</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Lightning, title: 'Tecnologia',
                    desc: 'Plataforma própria com IA que conecta Meta Ads, Google Ads, WhatsApp, discador, CRM e attribution num sistema só. Elimina gestor de tráfego, ferramentas avulsas e planilhas.',
                  },
                  {
                    icon: GearSix, title: 'Processo',
                    desc: 'Playbook comercial completo: scripts, rotina do time, funil estruturado, métricas. Dados de marketing informam vendas, dados de vendas informam marketing. Um loop, não dois departamentos.',
                  },
                  {
                    icon: UserCheck, title: 'Gestão',
                    desc: 'Diretor comercial dedicado com Sales Ops alimentado por IA: sabe exatamente qual campanha gera mais receita, qual vendedor performa melhor, e onde está o gargalo — em tempo real.',
                  },
                ].map((p) => (
                  <div key={p.title} className="bg-[hsl(240,10%,7%)] border border-[hsl(150,100%,50%)]/10 rounded-2xl p-8">
                    <p.icon className="text-[hsl(150,100%,50%)] mb-4" size={28} />
                    <h4 className="font-['Michroma'] text-lg mb-3">{p.title}</h4>
                    <p className="text-sm text-[hsl(0,0%,55%)] font-['Outfit'] leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── PRA QUEM ─── */}
      <section id="pra-quem" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// Pra Quem É</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-4">
              Feito para empresas que investem em marketing e precisam de{' '}
              <span className="text-[hsl(150,100%,50%)]">resultado previsível.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Outfit'] text-lg leading-relaxed mb-10 max-w-4xl">
              Se sua empresa roda anúncios, gera leads e precisa converter em receita — o Seialz foi feito pra você.
              Não importa o segmento. Importa que você quer saber exatamente quanto cada real investido retorna.
            </motion.p>

            {/* Segmentos */}
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mb-14">
              {[
                'Escritórios de Imigração', 'Advocacia', 'Imobiliárias', 'Seguros',
                'Clínicas e Saúde', 'Consultoria Financeira', 'Educação e Cursos',
                'Energia Solar', 'E-commerce', 'Consultorias', 'SaaS', 'Home Services',
              ].map((s) => (
                <span key={s} className="px-4 py-2 rounded-full border border-[hsl(150,100%,50%)]/20 text-sm text-[hsl(0,0%,70%)] font-['Outfit'] bg-[hsl(150,100%,50%)]/5">
                  {s}
                </span>
              ))}
            </motion.div>

            {/* Stats */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: 'R$10K+', label: 'investimento mensal em ads' },
                { value: '100+', label: 'leads por mês' },
                { value: '2-50', label: 'pessoas no time comercial' },
                { value: 'ROI', label: 'real de cada campanha' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className="text-2xl md:text-3xl font-['Michroma'] text-[hsl(150,100%,50%)]">{s.value}</span>
                  <p className="text-xs text-[hsl(0,0%,50%)] mt-2 font-['Outfit']">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── O QUE ESTÁ INCLUSO ─── */}
      <section id="incluso" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// O Que Você Recebe</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-12 max-w-4xl">
              Tudo que sua operação precisa.{' '}
              <span className="text-[hsl(150,100%,50%)]">Sem contratar gestor de tráfego, sem CRM avulso, sem planilha.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: Target, title: 'AI Revenue Attribution', desc: 'Cada real de receita rastreado de volta ao anúncio exato que gerou. Não CPL. Receita.' },
                { icon: ArrowsClockwise, title: 'Loop Marketing ↔ Vendas', desc: 'Dados de contratos fechados voltam automaticamente pro Meta e Google pra otimizar campanhas.' },
                { icon: ChartLineUp, title: 'CRM com Pipeline Integrado', desc: 'Do clique no anúncio ao contrato assinado, um pipeline único. Sem handoff, sem dado perdido.' },
                { icon: PhoneCall, title: 'Power Dialer com IA', desc: 'Discador inteligente que prioriza automaticamente. Liga pro lead certo na hora certa.' },
                { icon: Robot, title: 'AI Sales Coach', desc: 'Coaching em tempo real durante ligações. Análise pós-call. Insights que melhoram conversão.' },
                { icon: ChatCircleText, title: 'Comunicação Omnichannel', desc: 'SMS, WhatsApp, ligações, email — tudo numa thread. Branded calling.' },
                { icon: UsersThree, title: 'Distribuição Inteligente de Leads', desc: 'Round-robin com regras. Distribui por performance, disponibilidade, tipo de lead.' },
                { icon: ChartBar, title: 'Sales Ops Dashboard', desc: 'Receita por vendedor, por campanha, por fonte. Gargalos detectados em tempo real.' },
                { icon: UserCheck, title: 'Diretor Comercial Dedicado', desc: 'Acompanhamento semanal. Coaching do time. Relatórios. Gestão de verdade.' },
              ].map((f) => (
                <div key={f.title} className="bg-[hsl(240,10%,7%)] border border-[hsl(150,100%,50%)]/10 rounded-2xl p-6 hover:border-[hsl(150,100%,50%)]/30 transition-colors group">
                  <f.icon className="text-[hsl(150,100%,50%)] mb-4 group-hover:scale-110 transition-transform" size={24} />
                  <h4 className="font-['Michroma'] text-sm mb-2">{f.title}</h4>
                  <p className="text-sm text-[hsl(0,0%,50%)] font-['Outfit'] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="como-funciona" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// Como Funciona</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-12">
              Em 30 dias, marketing e vendas viram{' '}
              <span className="text-[hsl(150,100%,50%)]">uma máquina só.</span>
            </motion.h2>

            <div className="space-y-0 relative">
              {/* Vertical line */}
              <div className="absolute left-6 md:left-8 top-8 bottom-8 w-px bg-gradient-to-b from-[hsl(150,100%,50%)] via-[hsl(150,100%,50%)]/30 to-transparent" />
              {[
                { step: '01', title: 'Diagnóstico', desc: 'Analisamos seu funil inteiro: ads, landing pages, CRM, time comercial. Identificamos onde receita está sendo perdida.' },
                { step: '02', title: 'Implementação', desc: 'Setup da plataforma Seialz: integrações com Meta/Google Ads, WhatsApp, discador, CRM, attribution. Tudo conectado.' },
                { step: '03', title: 'Playbook', desc: 'Scripts de vendas, rotina comercial, métricas de performance, treinamento do time. O loop marketing ↔ vendas começa a rodar.' },
                { step: '04', title: 'Operação', desc: 'Diretor comercial assume. Dashboards ativos. Campanhas otimizadas por dados reais de vendas. Máquina funcionando.' },
              ].map((item) => (
                <motion.div key={item.step} variants={fadeUp} className="relative pl-16 md:pl-20 pb-12 last:pb-0">
                  <div className="absolute left-2 md:left-4 w-8 h-8 rounded-full bg-[hsl(150,100%,50%)] flex items-center justify-center">
                    <span className="text-xs font-bold text-[hsl(240,10%,4%)] font-['Michroma']">{item.step}</span>
                  </div>
                  <h4 className="font-['Michroma'] text-lg mb-2">{item.title}</h4>
                  <p className="text-[hsl(0,0%,55%)] font-['Outfit'] leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
            <motion.p variants={fadeUp} className="mt-10 text-sm text-[hsl(0,0%,40%)] font-['Outfit'] italic">
              O acompanhamento é contínuo. A cada semana o loop fica mais inteligente: melhores campanhas, melhores leads, mais conversão, mais receita.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── RESULTADOS ─── */}
      <section id="resultados" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// Resultados</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-2xl md:text-4xl leading-tight mb-14">
              O que muda nos primeiros{' '}
              <span className="text-[hsl(150,100%,50%)]">90 dias.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: 2, suffix: 'x', label: 'velocidade de resposta aos leads' },
                { value: 40, prefix: '+', suffix: '%', label: 'taxa de conversão' },
                { value: 100, suffix: '%', label: 'visibilidade do ROI real' },
                { value: 30, prefix: '-', suffix: '%', label: 'custo por aquisição' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <span className="text-4xl md:text-5xl font-['Michroma'] text-[hsl(150,100%,50%)]">
                    {stat.prefix}
                    <AnimatedCounter value={stat.value} duration={2} />
                    {stat.suffix}
                  </span>
                  <p className="text-sm text-[hsl(0,0%,50%)] mt-3 font-['Outfit']">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA FINAL + FORMULÁRIO ─── */}
      <section id="cta" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="text-center">
            <motion.h2 variants={fadeUp} className="font-['Michroma'] text-3xl md:text-5xl leading-tight mb-4">
              Chega de adivinhar.{' '}
              <span className="text-[hsl(150,100%,50%)]">Comece a saber.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,55%)] font-['Outfit'] text-lg mb-12 max-w-2xl mx-auto">
              Agende um diagnóstico gratuito. Em 30 minutos analisamos seu funil inteiro — marketing e vendas —
              e mostramos onde você está perdendo receita.
            </motion.p>

            <motion.form
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="bg-[hsl(240,10%,7%)] border border-[hsl(150,100%,50%)]/15 rounded-3xl p-8 md:p-10 text-left space-y-5"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <input
                  type="text" required placeholder="Nome" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(150,100%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Outfit'] focus:outline-none focus:border-[hsl(150,100%,50%)]/40 transition-colors"
                />
                <input
                  type="text" required placeholder="Empresa" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(150,100%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Outfit'] focus:outline-none focus:border-[hsl(150,100%,50%)]/40 transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <input
                  type="email" required placeholder="Email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(150,100%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Outfit'] focus:outline-none focus:border-[hsl(150,100%,50%)]/40 transition-colors"
                />
                <input
                  type="tel" required placeholder="Telefone" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(150,100%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Outfit'] focus:outline-none focus:border-[hsl(150,100%,50%)]/40 transition-colors"
                />
              </div>
              <select
                required value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(150,100%,50%)]/10 rounded-xl px-5 py-3.5 text-white font-['Outfit'] focus:outline-none focus:border-[hsl(150,100%,50%)]/40 transition-colors appearance-none"
              >
                <option value="" disabled className="text-[hsl(0,0%,35%)]">Investimento mensal em ads</option>
                <option value="<5k">Menos de R$5K</option>
                <option value="5-15k">R$5K – R$15K</option>
                <option value="15-50k">R$15K – R$50K</option>
                <option value=">50k">Mais de R$50K</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="w-full auth-btn-primary py-4 rounded-full text-base font-bold font-['Outfit'] transition-all hover:shadow-[0_0_30px_hsl(150,100%,50%,0.35)] hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? 'Enviando...' : (
                  <>AGENDAR DIAGNÓSTICO <ArrowRight size={18} /></>
                )}
              </button>
            </motion.form>
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
