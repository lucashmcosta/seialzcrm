import { useState } from 'react';
import { motion } from 'framer-motion';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';
import { toast } from '@/hooks/use-toast';
import {
  Target, ArrowsClockwise, ChartLineUp, PhoneCall, Robot, ChatCircleText,
  UsersThree, ChartBar, Lightning, GearSix, UserCheck, ArrowRight,
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
    <span className="inline-block text-xs tracking-[4px] uppercase text-[hsl(120,61%,50%)] font-['Sora'] font-extrabold mb-4">
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
              <SectionTag>// sales ops nativo</SectionTag>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-4xl md:text-6xl lg:text-7xl leading-tight tracking-tight mb-6"
            >
              Marketing e vendas{' '}
              <span className="text-[hsl(120,61%,50%)]">nunca deveriam ter sido separados.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl text-[hsl(0,0%,60%)] max-w-3xl mx-auto mb-4 font-['Sora'] leading-relaxed"
            >
              O Seialz é a plataforma onde os dados de marketing e vendas nascem conectados.
              Não integrados por API. Não colados por planilha.{' '}
              <span className="text-white font-medium">Juntos desde o primeiro clique.</span>
            </motion.p>
            <motion.p
              variants={fadeUp}
              className="text-base text-[hsl(0,0%,50%)] max-w-2xl mx-auto mb-10 font-['Sora'] leading-relaxed"
            >
              Pra empresas de serviço que vendem por atendimento direto — e querem saber exatamente quanto cada real investido retorna.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#cta"
                className="auth-btn-primary px-8 py-4 rounded-full text-base font-bold font-['Sora'] transition-all hover:shadow-[0_0_30px_hsl(120,61%,50%,0.35)] hover:scale-105"
              >
                AGENDAR DIAGNÓSTICO GRATUITO
              </a>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-4 text-sm text-[hsl(0,0%,40%)] font-['Sora']">
              Análise do seu funil · 30 min · Sem compromisso
            </motion.p>
          </motion.div>
        </div>
        <div
          className="absolute inset-0 opacity-30 pointer-events-none bg-center bg-cover mix-blend-screen"
          style={{ backgroundImage: `url(${linhasMedia.url})` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(120,61%,50%,0.08)_0%,transparent_70%)] pointer-events-none" />
      </section>

      {/* ─── BARRA DE PROVA ─── */}
      <section className="py-16 md:py-20 bg-[hsl(240,10%,3%)] border-y border-[hsl(120,61%,50%)]/10">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: '8.7x', label: 'redução de CPL\nCTWA vs Lead Form' },
                { value: 'R$1.5M+', label: 'receita gerada a mais\nque outros sistemas' },
                { value: '15k+', label: 'leads reativados\npor AI agent' },
                { value: '250+', label: 'pessoas operando\nno sistema' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className="text-3xl md:text-4xl font-['Sora'] font-extrabold text-[hsl(120,61%,50%)]">{s.value}</span>
                  <p className="text-xs text-[hsl(0,0%,50%)] mt-3 font-['Sora'] whitespace-pre-line">{s.label}</p>
                </div>
              ))}
            </motion.div>
            <motion.p variants={fadeUp} className="text-center text-xs text-[hsl(0,0%,35%)] font-['Sora'] mt-8">
              Dados reais de operação própria — não de cliente hipotético.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── O PROBLEMA ─── */}
      <section id="problema" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// O Problema</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-8">
              Marketing culpa vendas. Vendas culpa marketing.{' '}
              <span className="text-[hsl(120,61%,50%)]">Ninguém olha pro que importa: receita.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-6 text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12">
              <p>
                Sua empresa tem um gestor de tráfego que mede CPL. Um time comercial que mede conversão.
                E uma planilha que tenta juntar os dois.
              </p>
              <p>
                Marketing diz que entregou 500 leads. Vendas diz que os leads são ruins. E você não sabe quem tem razão — porque os dados não se conectam.
              </p>
            </motion.div>

            {/* Versus comparison */}
            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
              <div className="bg-[hsl(0,60%,5%)] border border-[hsl(0,70%,20%)] rounded-2xl p-7">
                <span className="text-[10px] tracking-[3px] uppercase text-[hsl(0,80%,60%)] font-['Space_Mono'] mb-4 block">
                  Integrado por API
                </span>
                <div className="space-y-2 text-sm text-[hsl(0,0%,50%)] font-['Sora']">
                  <p>Meta Ads → Zapier → CRM</p>
                  <p>Dado chega atrasado</p>
                  <p>Atribuição quebrada</p>
                  <p>Ninguém confia no número</p>
                  <p>Gestor de tráfego num canto</p>
                  <p>CRM genérico no outro</p>
                  <p>"Integração" que sempre quebra</p>
                </div>
              </div>
              <div className="bg-[hsl(120,40%,5%)] border border-[hsl(120,45%,22%)] rounded-2xl p-7">
                <span className="text-[10px] tracking-[3px] uppercase text-[hsl(120,61%,50%)] font-['Space_Mono'] mb-4 block">
                  Nativo no Seialz
                </span>
                <div className="space-y-2 text-sm text-[hsl(0,0%,50%)] font-['Sora']">
                  <p>Um sistema desde o clique</p>
                  <p>Dado em tempo real</p>
                  <p>Attribution até a receita</p>
                  <p>Número que você confia</p>
                  <p>Marketing e vendas = mesma tela</p>
                  <p>Uma fonte de verdade</p>
                  <p>Zero integração pra quebrar</p>
                </div>
              </div>
            </motion.div>

            <motion.p variants={fadeUp} className="text-white font-medium font-['Sora'] text-lg leading-relaxed">
              O problema não é falta de leads nem falta de vendedores. É que marketing e vendas foram construídos como dois mundos separados. O Seialz nasceu pra ser um só.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── A SOLUÇÃO — 3 PILARES ─── */}
      <section id="solucao" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// A Solução</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-6">
              Não é só software. Não é só consultoria.{' '}
              <span className="text-[hsl(120,61%,50%)]">É a operação inteira.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12 max-w-4xl">
              Sales Ops de verdade precisa de tecnologia que funcione, processo que o time siga, e alguém olhando os números. O Seialz entrega os três.
            </motion.p>

            {/* 3 Pilares */}
            <motion.div variants={fadeUp} className="space-y-4">
              {[
                {
                  icon: Lightning, num: 'Pilar 01 — Tecnologia', title: 'Plataforma própria com IA',
                  desc: 'Conecta Meta Ads, Google Ads, WhatsApp, discador, CRM e attribution num sistema só. Não é Frankenstein de ferramentas coladas por Zapier. É um produto que nasceu integrado — lead entra e já está no pipeline, com origem rastreada até a receita.',
                },
                {
                  icon: GearSix, num: 'Pilar 02 — Processo', title: 'Playbook comercial completo',
                  desc: 'Scripts validados em operação real, funil estruturado, rotina do time, métricas que importam. Dados de marketing informam vendas, dados de vendas informam marketing. Um loop — não dois departamentos brigando.',
                },
                {
                  icon: UserCheck, num: 'Pilar 03 — Acompanhamento', title: 'Diretor comercial dedicado + Sales Ops com IA',
                  desc: 'Acompanhamento semanal do seu time. Coaching, relatórios, gestão de verdade. Alimentado por dados em tempo real — sabe qual campanha gera receita, qual vendedor performa, e onde está o gargalo. Não é dashboard bonito que ninguém olha. É gestão ativa.',
                },
              ].map((p) => (
                <div key={p.num} className="bg-[hsl(240,10%,7%)] border border-[hsl(120,61%,50%)]/10 rounded-2xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(120,61%,50%)] opacity-60" />
                  <div className="pl-4">
                    <span className="text-[10px] tracking-[3px] uppercase text-[hsl(120,61%,50%)] font-['Space_Mono'] mb-3 block">{p.num}</span>
                    <h4 className="font-['Sora'] font-extrabold text-lg mb-3">{p.title}</h4>
                    <p className="text-sm text-[hsl(0,0%,55%)] font-['Sora'] leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── O LOOP ─── */}
      <section id="loop" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// O Loop</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-6">
              O ciclo que fica mais inteligente{' '}
              <span className="text-[hsl(120,61%,50%)]">a cada venda.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12 max-w-4xl">
              Quando marketing e vendas compartilham os mesmos dados nativamente, algo muda: cada venda ensina o marketing a trazer leads melhores. E cada lead melhor facilita a venda.
            </motion.p>

            <motion.div variants={fadeUp} className="space-y-0">
              {[
                { n: '01', t: 'Marketing roda campanha → lead entra no Seialz automaticamente com origem rastreada' },
                { n: '02', t: 'IA distribui pro vendedor certo com base em regras e performance → cada interação é registrada' },
                { n: '03', t: 'Lead fecha (ou não) → o resultado volta pro marketing com contexto completo: motivo de perda, ticket, tempo' },
                { n: '04', t: 'Marketing otimiza com dados de receita real → algoritmo aprende → melhores leads chegam → vendas converte mais' },
                { n: '05', t: 'O ciclo se repete. A cada rodada, o sistema sabe mais sobre o que funciona — e o que não funciona.' },
              ].map((s) => (
                <div key={s.n} className="flex items-start gap-6 py-6 border-b border-[hsl(0,0%,8%)]">
                  <span className="font-['Sora'] font-extrabold text-2xl text-[hsl(120,61%,50%)] opacity-80 flex-shrink-0 w-14">{s.n}</span>
                  <p className="text-[hsl(0,0%,60%)] font-['Sora'] leading-relaxed pt-1">{s.t}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── O QUE VOCÊ RECEBE ─── */}
      <section id="incluso" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// O Que Você Recebe</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-4 max-w-4xl">
              Tudo que sua operação precisa.{' '}
              <span className="text-[hsl(120,61%,50%)]">Nada que não precisa.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12 max-w-4xl">
              Sem contratar gestor de tráfego avulso. Sem CRM genérico. Sem planilha de acompanhamento. Um sistema, uma assinatura.
            </motion.p>
            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: Target, title: 'AI Revenue Attribution', desc: 'Cada real de receita rastreado de volta ao anúncio que gerou. Não CPL — receita real por campanha, por criativo, por público.' },
                { icon: ChartLineUp, title: 'CRM com Pipeline Único', desc: 'Do clique no anúncio ao contrato assinado, um pipeline só. Sem handoff entre sistemas, sem dado perdido.' },
                { icon: ArrowsClockwise, title: 'Loop Marketing ↔ Vendas', desc: 'Dados de contratos fechados voltam automaticamente pro Meta e Google. O algoritmo aprende o que gera receita, não clique.' },
                { icon: PhoneCall, title: 'Power Dialer com IA', desc: 'Discador que prioriza por score. Liga pro lead certo, na hora certa, com contexto completo na tela.' },
                { icon: UsersThree, title: 'Distribuição Inteligente de Leads', desc: 'Round-robin com regras: performance, disponibilidade, tipo de lead. Nenhum lead fica parado.' },
                { icon: Robot, title: 'AI Sales Coach', desc: 'Coaching em tempo real durante ligações. Análise pós-call. Insights que melhoram conversão a cada semana.' },
                { icon: ChatCircleText, title: 'Comunicação Omnichannel', desc: 'WhatsApp, SMS, ligação, email — tudo numa thread só. Branded calling pra aumentar atendimento.' },
                { icon: ChartBar, title: 'Sales Ops Dashboard', desc: 'Receita por vendedor, campanha, fonte. Gargalos em tempo real. Comissão calculada automaticamente.' },
              ].map((f) => (
                <div key={f.title} className="bg-[hsl(240,10%,7%)] border border-[hsl(120,61%,50%)]/10 rounded-2xl p-6 hover:border-[hsl(120,61%,50%)]/30 transition-colors group">
                  <f.icon className="text-[hsl(120,61%,50%)] mb-4 group-hover:scale-110 transition-transform" size={24} weight="light" />
                  <h4 className="font-['Sora'] font-extrabold text-sm mb-2">{f.title}</h4>
                  <p className="text-sm text-[hsl(0,0%,50%)] font-['Sora'] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── PRA QUEM ─── */}
      <section id="pra-quem" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// Pra Quem É</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-4">
              Empresas de serviço que vendem por{' '}
              <span className="text-[hsl(120,61%,50%)]">atendimento direto.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-10 max-w-4xl">
              Se sua empresa roda anúncios, gera leads e converte por WhatsApp, telefone ou atendimento presencial — o Seialz foi construído pra essa operação. Não importa o segmento. Importa o modelo.
            </motion.p>

            {/* Segmentos */}
            <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {[
                { name: 'Escritórios de Imigração', proof: 'CPL reduzido 8.7x · R$1.5M+ gerados a mais' },
                { name: 'Serviços Automotivos', proof: 'Implementação ativa — case em construção' },
                { name: 'Serviços com Drones', proof: 'Implementação ativa — case em construção' },
                { name: 'Advocacia & Consultoria', proof: 'High-touch · WhatsApp + ligação' },
              ].map((s) => (
                <div key={s.name} className="bg-[hsl(240,10%,7%)] border border-[hsl(120,61%,50%)]/10 rounded-xl p-5 hover:border-[hsl(120,61%,50%)]/25 transition-colors">
                  <h4 className="font-['Sora'] font-semibold text-white text-[15px] mb-1">{s.name}</h4>
                  <p className="text-[11px] text-[hsl(120,61%,50%)] font-['Space_Mono'] leading-relaxed">{s.proof}</p>
                </div>
              ))}
            </motion.div>

            <motion.p variants={fadeUp} className="text-[hsl(0,0%,50%)] font-['Sora'] text-base leading-relaxed mb-10">
              Se sua empresa depende de gerar e converter leads por atendimento direto, a gente já ajudou alguém parecido com você.
            </motion.p>

            {/* Stats */}
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-6">
              {[
                { value: '2–50', label: 'pessoas no\ntime comercial' },
                { value: 'ROI', label: 'por campanha\nnão CPL' },
                { value: '1', label: 'sistema único\nzero Frankenstein' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className="text-2xl md:text-3xl font-['Sora'] font-extrabold text-[hsl(120,61%,50%)]">{s.value}</span>
                  <p className="text-xs text-[hsl(0,0%,50%)] mt-2 font-['Sora'] whitespace-pre-line">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── POR QUE "NATIVO" IMPORTA ─── */}
      <section id="por-que-nativo" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}><SectionTag>// Por Que "Nativo" Importa</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-8">
              Qualquer um integra.{' '}
              <span className="text-[hsl(120,61%,50%)]">Ninguém nasceu junto.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-6 text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed">
              <p>
                O mercado inteiro tenta resolver o problema de Sales Ops conectando ferramentas que foram construídas separadas. Meta Ads de um lado. CRM do outro. Zapier ou Make no meio tentando colar tudo.
              </p>
              <p>
                O problema? Integração é frágil. API quebra. Dado atrasa. Attribution fica incompleta. E na hora que você mais precisa do número — ele não é confiável.
              </p>

              {/* Manifesto quote */}
              <blockquote className="text-xl md:text-2xl font-semibold text-white leading-snug pl-6 border-l-2 border-[hsl(120,61%,50%)]/60 my-8">
                O Seialz não integra marketing e vendas. Eles nunca foram separados aqui.
              </blockquote>

              <p>
                Quando o lead clica no anúncio e entra no sistema, o dado de marketing e o dado de vendas já são o mesmo dado. Não precisa de sync. Não precisa de webhook. Não precisa rezar pra integração não quebrar no fim de semana.
              </p>
              <p>
                É por isso que chamamos de Sales Ops nativo. Não é um CRM com plugin de ads. Não é uma ferramenta de marketing com CRM colado. É um produto que foi desenhado desde o dia zero pra ser as duas coisas ao mesmo tempo.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA FINAL + FORMULÁRIO ─── */}
      <section id="cta" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="text-center">
            <motion.div variants={fadeUp}><SectionTag>// próximo passo</SectionTag></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Sora'] font-extrabold text-3xl md:text-5xl leading-tight mb-4">
              Quer saber onde sua operação está{' '}
              <span className="text-[hsl(120,61%,50%)]">deixando dinheiro na mesa?</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,55%)] font-['Sora'] text-lg mb-12 max-w-2xl mx-auto">
              Em 30 minutos, analisamos seu funil do anúncio ao fechamento e mostramos exatamente onde estão os gargalos — com dados, não opinião.
            </motion.p>

            <motion.form
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="bg-[hsl(240,10%,7%)] border border-[hsl(120,61%,50%)]/15 rounded-3xl p-8 md:p-10 text-left space-y-5"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <input
                  type="text" required placeholder="Nome" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(120,61%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Sora'] focus:outline-none focus:border-[hsl(120,61%,50%)]/40 transition-colors"
                />
                <input
                  type="text" required placeholder="Empresa" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(120,61%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Sora'] focus:outline-none focus:border-[hsl(120,61%,50%)]/40 transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <input
                  type="email" required placeholder="Email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(120,61%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Sora'] focus:outline-none focus:border-[hsl(120,61%,50%)]/40 transition-colors"
                />
                <input
                  type="tel" required placeholder="Telefone" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(120,61%,50%)]/10 rounded-xl px-5 py-3.5 text-white placeholder:text-[hsl(0,0%,35%)] font-['Sora'] focus:outline-none focus:border-[hsl(120,61%,50%)]/40 transition-colors"
                />
              </div>
              <select
                required value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full bg-[hsl(240,10%,10%)] border border-[hsl(120,61%,50%)]/10 rounded-xl px-5 py-3.5 text-white font-['Sora'] focus:outline-none focus:border-[hsl(120,61%,50%)]/40 transition-colors appearance-none"
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
                className="w-full auth-btn-primary py-4 rounded-full text-base font-bold font-['Sora'] transition-all hover:shadow-[0_0_30px_hsl(120,61%,50%,0.35)] hover:scale-[1.02] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? 'Enviando...' : (
                  <>AGENDAR DIAGNÓSTICO <ArrowRight size={18} /></>
                )}
              </button>
              <p className="text-center text-xs text-[hsl(0,0%,40%)] font-['Sora']">
                30 min · Sem compromisso · Análise real do seu funil
              </p>
            </motion.form>
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
