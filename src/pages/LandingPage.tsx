import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";
import linhasMedia from "@/assets/brand/linhas-media-dark.svg.asset.json";

/* ── Animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
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

/* CTA reutilizável — contato puro, sem promessa de diagnóstico */
function ContactButton({ full = false }: { full?: boolean }) {
  return (
    <a
      href="#cta"
      className={`auth-btn-primary ${full ? "w-full" : "px-8"} py-4 rounded-full text-base font-bold font-['Sora'] transition-all hover:shadow-[0_0_30px_hsl(120,61%,50%,0.35)] hover:scale-105 inline-flex items-center justify-center`}
    >
      FALAR COM A SEIALZ
    </a>
  );
}

/* ══════════════════════════════════════════════════════════════
   LANDING PAGE — Copy institucional (corporativo premium)
   ══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
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
              Marketing e vendas, <span className="text-[hsl(120,61%,50%)]">finalmente uma operação só.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl text-[hsl(0,0%,60%)] max-w-3xl mx-auto mb-4 font-['Sora'] leading-relaxed"
            >
              O Seialz é a plataforma onde os dados de marketing e vendas nascem conectados. Não integrados por API. Não
              consolidados em planilha.{" "}
              <span className="text-white font-medium">Unificados desde o primeiro clique.</span>
            </motion.p>
            <motion.p
              variants={fadeUp}
              className="text-base text-[hsl(0,0%,50%)] max-w-2xl mx-auto mb-10 font-['Sora'] leading-relaxed"
            >
              Concebido para empresas de serviço que vendem por atendimento direto e exigem visibilidade precisa do
              retorno de cada real investido.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <ContactButton />
            </motion.div>
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
                { value: "8.7x", label: "redução de CPL\nCTWA vs Lead Form" },
                { value: "R$1.5M+", label: "receita gerada a mais\nque outros sistemas" },
                { value: "15k+", label: "leads reativados\npor AI agent" },
                { value: "250+", label: "pessoas operando\nno sistema" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className="text-3xl md:text-4xl font-['Sora'] font-extrabold text-[hsl(120,61%,50%)]">
                    {s.value}
                  </span>
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
            <motion.div variants={fadeUp}>
              <SectionTag>// O Problema</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-8"
            >
              Marketing responsabiliza vendas. Vendas responsabiliza marketing.{" "}
              <span className="text-[hsl(120,61%,50%)]">E a receita permanece sem dono.</span>
            </motion.h2>
            <motion.div
              variants={fadeUp}
              className="space-y-6 text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12"
            >
              <p>
                Sua empresa conta com um gestor de tráfego que mede CPL e um time comercial que mede conversão —
                enquanto uma planilha tenta reconciliar os dois mundos.
              </p>
              <p>
                Marketing reporta 500 leads entregues. Vendas classifica os leads como insuficientes. E não há como
                arbitrar quem tem razão, porque os dados nunca se conectam.
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
                  <p>Dado que chega atrasado</p>
                  <p>Atribuição quebrada</p>
                  <p>Número em que ninguém confia</p>
                  <p>Gestor de tráfego isolado</p>
                  <p>CRM genérico à parte</p>
                  <p>"Integração" que sempre falha</p>
                </div>
              </div>
              <div className="bg-[hsl(120,40%,5%)] border border-[hsl(120,45%,22%)] rounded-2xl p-7">
                <span className="text-[10px] tracking-[3px] uppercase text-[hsl(120,61%,50%)] font-['Space_Mono'] mb-4 block">
                  Nativo no Seialz
                </span>
                <div className="space-y-2 text-sm text-[hsl(0,0%,50%)] font-['Sora']">
                  <p>Um sistema desde o clique</p>
                  <p>Dado em tempo real</p>
                  <p>Atribuição até a receita</p>
                  <p>Número em que você confia</p>
                  <p>Marketing e vendas na mesma tela</p>
                  <p>Uma fonte única de verdade</p>
                  <p>Zero integração para falhar</p>
                </div>
              </div>
            </motion.div>

            <motion.p variants={fadeUp} className="text-white font-medium font-['Sora'] text-lg leading-relaxed">
              O problema não está na ausência de leads, tampouco de vendedores. Está no fato de marketing e vendas terem
              sido concebidos como dois mundos distintos. O Seialz nasceu para ser um só.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── A SOLUÇÃO — 3 CAPACIDADES DA PLATAFORMA ─── */}
      <section id="solucao" className="py-24 md:py-32 auth-grid-pattern relative">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// A Solução</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-6"
            >
              Uma plataforma onde marketing e vendas operam{" "}
              <span className="text-[hsl(120,61%,50%)]">sobre o mesmo dado.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12 max-w-4xl"
            >
              A desconexão entre marketing e vendas não se resolve com mais uma integração. Resolve-se com um sistema
              concebido, desde a origem, para tratar os dois como uma operação única.
            </motion.p>

            {/* 3 capacidades */}
            <motion.div variants={fadeUp} className="space-y-4">
              {[
                {
                  num: "Dado Único",
                  title: "Do clique à receita, sem ruptura",
                  desc: "Meta Ads, Google Ads, WhatsApp, discador, CRM e atribuição operam sobre uma única base. O lead ingressa já posicionado no pipeline, com origem rastreada até o fechamento — sem a fragilidade de ferramentas conectadas por terceiros.",
                },
                {
                  num: "Atribuição Real",
                  title: "Cada real investido, rastreado até o resultado",
                  desc: "A origem de cada lead permanece visível em toda a jornada. Você sabe qual campanha gera receita — não apenas qual gera cliques —, eliminando a atribuição quebrada e o número em que ninguém confia.",
                },
                {
                  num: "Tempo Real",
                  title: "Uma fonte de verdade, viva",
                  desc: "Marketing e vendas enxergam a mesma informação, no mesmo instante, na mesma tela. Sem defasagem, sem reconciliação manual, sem versões divergentes da realidade.",
                },
              ].map((p) => (
                <div
                  key={p.num}
                  className="bg-[hsl(240,10%,7%)] border border-[hsl(120,61%,50%)]/10 rounded-2xl p-8 relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(120,61%,50%)] opacity-60" />
                  <div className="pl-4">
                    <span className="text-[10px] tracking-[3px] uppercase text-[hsl(120,61%,50%)] font-['Space_Mono'] mb-3 block">
                      {p.num}
                    </span>
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
            <motion.div variants={fadeUp}>
              <SectionTag>// O Loop</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-6"
            >
              Um ciclo que se aprimora <span className="text-[hsl(120,61%,50%)]">a cada venda.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed mb-12 max-w-4xl"
            >
              Quando marketing e vendas compartilham os mesmos dados de forma nativa, estabelece-se uma dinâmica
              virtuosa: cada venda orienta o marketing a captar leads melhores, e cada lead qualificado facilita a venda
              seguinte.
            </motion.p>

            <motion.div variants={fadeUp} className="space-y-0">
              {[
                {
                  n: "01",
                  t: "Marketing executa a campanha → o lead ingressa no Seialz automaticamente, com origem rastreada.",
                },
                {
                  n: "02",
                  t: "A IA direciona ao vendedor adequado, segundo regras e performance → cada interação é registrada.",
                },
                {
                  n: "03",
                  t: "O lead se converte (ou não) → o resultado retorna ao marketing com contexto completo: motivo de perda, ticket, tempo de ciclo.",
                },
                {
                  n: "04",
                  t: "Marketing otimiza com dados de receita real → o algoritmo aprende → melhores leads ingressam → vendas convertem mais.",
                },
                {
                  n: "05",
                  t: "O ciclo se repete. A cada rodada, o sistema compreende com maior precisão o que funciona — e o que não funciona.",
                },
              ].map((s) => (
                <div key={s.n} className="flex items-start gap-6 py-6 border-b border-[hsl(0,0%,8%)]">
                  <span className="font-['Sora'] font-extrabold text-2xl text-[hsl(120,61%,50%)] opacity-80 flex-shrink-0 w-14">
                    {s.n}
                  </span>
                  <p className="text-[hsl(0,0%,60%)] font-['Sora'] leading-relaxed pt-1">{s.t}</p>
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
            <motion.div variants={fadeUp}>
              <SectionTag>// Por Que "Nativo" Importa</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-2xl md:text-4xl leading-tight mb-8"
            >
              Qualquer sistema integra. <span className="text-[hsl(120,61%,50%)]">Nenhum nasceu unificado.</span>
            </motion.h2>
            <motion.div
              variants={fadeUp}
              className="space-y-6 text-[hsl(0,0%,60%)] font-['Sora'] text-lg leading-relaxed"
            >
              <p>
                O mercado tenta resolver a desconexão entre marketing e vendas conectando ferramentas concebidas
                separadamente. Meta Ads de um lado, CRM do outro, e uma camada de integração no meio tentando
                reconciliar tudo.
              </p>
              <p>
                A consequência é conhecida: integrações são frágeis, APIs falham, o dado atrasa e a atribuição fica
                incompleta. No momento em que o número é mais necessário, ele não é confiável.
              </p>

              {/* Manifesto */}
              <blockquote className="text-xl md:text-2xl font-semibold text-white leading-snug pl-6 border-l-2 border-[hsl(120,61%,50%)]/60 my-8">
                O Seialz não integra marketing e vendas. Aqui, eles nunca estiveram separados.
              </blockquote>

              <p>
                Quando o lead clica no anúncio e ingressa no sistema, o dado de marketing e o dado de vendas já são o
                mesmo dado. Sem sincronização, sem webhook, sem dependência de uma integração que pode falhar a qualquer
                momento.
              </p>
              <p>
                É por isso que falamos em Sales Ops nativo: não um CRM com plugin de anúncios, tampouco uma ferramenta
                de marketing com CRM acoplado, mas um produto concebido desde a origem para ser as duas coisas,
                simultaneamente.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section id="cta" className="py-24 md:py-32 bg-[hsl(240,10%,3%)]">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            className="text-center"
          >
            <motion.div variants={fadeUp}>
              <SectionTag>// próximo passo</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-['Sora'] font-extrabold text-3xl md:text-5xl leading-tight mb-4"
            >
              Marketing e vendas, <span className="text-[hsl(120,61%,50%)]">sobre o mesmo dado.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[hsl(0,0%,55%)] font-['Sora'] text-lg mb-12 max-w-2xl mx-auto">
              Conheça como o Seialz unifica sua operação comercial em um único sistema.
            </motion.p>
            <motion.div variants={fadeUp} className="flex justify-center">
              <ContactButton />
            </motion.div>
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
