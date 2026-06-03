import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";
import linhasMedia from "@/assets/brand/linhas-media-light.svg.asset.json";
import linhasSutil from "@/assets/brand/linhas-sutil-light.svg.asset.json";

/* ── Brand tokens (Manual da Marca) ──
   paper #FFFFFF · snow #F6F7F6 · ink #0A0A0A · green #32CD32
   forest #1E7A1E · soft #4A4D4A · ash #7A7E7A · line #E6E8E6
*/
const C = {
  paper: "#FFFFFF",
  snow: "#F6F7F6",
  ink: "#0A0A0A",
  green: "#32CD32",
  forest: "#1E7A1E",
  soft: "#4A4D4A",
  ash: "#7A7E7A",
  line: "#E6E8E6",
};

/* ── Animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

function SectionTag({ children }: { children: string }) {
  return (
    <span
      className="inline-block text-xs uppercase font-bold mb-4"
      style={{ color: C.forest, fontFamily: "'Space Mono', monospace", letterSpacing: "4px" }}
    >
      {children}
    </span>
  );
}

function ContactButton({ full = false }: { full?: boolean }) {
  return (
    <a
      href="#cta"
      className={`${full ? "w-full" : "px-8"} py-4 rounded-full text-base font-bold inline-flex items-center justify-center transition-all hover:scale-105`}
      style={{
        backgroundColor: C.green,
        color: C.ink,
        fontFamily: "'Sora', sans-serif",
        boxShadow: "0 8px 24px rgba(50,205,50,0.25)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 32px rgba(50,205,50,0.45)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(50,205,50,0.25)")}
    >
      FALAR COM A SEIALZ
    </a>
  );
}

const cardBase: React.CSSProperties = {
  backgroundColor: C.paper,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
};

export default function LandingPage() {
  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: C.paper, color: C.ink, fontFamily: "'Sora', sans-serif" }}
    >
      <LandingNavbar />

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 md:pt-44 md:pb-36">
        {/* linhas de fundo */}
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{
            backgroundImage: `url(${linhasMedia.url})`,
            opacity: 0.55,
            maskImage:
              "radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(0,0,0,0.4) 55%, black 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(0,0,0,0.4) 55%, black 100%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(50,205,50,0.08) 0%, transparent 70%)" }}
        />
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// sales ops nativo</SectionTag>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-extrabold text-4xl md:text-6xl lg:text-7xl leading-tight mb-6"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Marketing e vendas, <span style={{ color: C.green }}>finalmente uma operação só.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl max-w-3xl mx-auto mb-4 leading-relaxed"
              style={{ color: C.soft }}
            >
              O Seialz é a plataforma onde os dados de marketing e vendas nascem conectados. Não integrados por API. Não
              consolidados em planilha.{" "}
              <span style={{ color: C.ink, fontWeight: 600 }}>Unificados desde o primeiro clique.</span>
            </motion.p>
            <motion.p
              variants={fadeUp}
              className="text-base max-w-2xl mx-auto mb-10 leading-relaxed"
              style={{ color: C.ash }}
            >
              Concebido para empresas de serviço que vendem por atendimento direto e exigem visibilidade precisa do
              retorno de cada real investido.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <ContactButton />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── BARRA DE PROVA ─── */}
      <section
        className="py-16 md:py-20"
        style={{ backgroundColor: C.snow, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}
      >
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
                  <span
                    className="text-3xl md:text-4xl font-extrabold"
                    style={{ color: C.forest, fontFamily: "'Space Mono', monospace" }}
                  >
                    {s.value}
                  </span>
                  <p className="text-xs mt-3 whitespace-pre-line" style={{ color: C.ash }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </motion.div>
            <motion.p variants={fadeUp} className="text-center text-xs mt-8" style={{ color: C.ash }}>
              Dados reais de operação própria — não de cliente hipotético.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── O PROBLEMA ─── */}
      <section id="problema" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// O Problema</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-extrabold text-2xl md:text-4xl leading-tight mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Marketing responsabiliza vendas. Vendas responsabiliza marketing.{" "}
              <span style={{ color: C.green }}>E a receita permanece sem dono.</span>
            </motion.h2>
            <motion.div
              variants={fadeUp}
              className="space-y-6 text-lg leading-relaxed mb-12"
              style={{ color: C.soft }}
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

            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
              <div
                className="p-7"
                style={{
                  backgroundColor: "#FDF6F6",
                  border: "1px solid #E8C8C8",
                  borderRadius: 18,
                }}
              >
                <span
                  className="text-[10px] uppercase mb-4 block font-bold"
                  style={{ color: "#A33A3A", fontFamily: "'Space Mono', monospace", letterSpacing: "3px" }}
                >
                  Integrado por API
                </span>
                <div className="space-y-2 text-sm" style={{ color: C.soft }}>
                  <p>Meta Ads → Zapier → CRM</p>
                  <p>Dado que chega atrasado</p>
                  <p>Atribuição quebrada</p>
                  <p>Número em que ninguém confia</p>
                  <p>Gestor de tráfego isolado</p>
                  <p>CRM genérico à parte</p>
                  <p>"Integração" que sempre falha</p>
                </div>
              </div>
              <div
                className="p-7"
                style={{
                  backgroundColor: "#F1FBF1",
                  border: "1px solid #C8E6C8",
                  borderRadius: 18,
                }}
              >
                <span
                  className="text-[10px] uppercase mb-4 block font-bold"
                  style={{ color: C.forest, fontFamily: "'Space Mono', monospace", letterSpacing: "3px" }}
                >
                  Nativo no Seialz
                </span>
                <div className="space-y-2 text-sm" style={{ color: C.soft }}>
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

            <motion.p
              variants={fadeUp}
              className="font-medium text-lg leading-relaxed"
              style={{ color: C.ink }}
            >
              O problema não está na ausência de leads, tampouco de vendedores. Está no fato de marketing e vendas terem
              sido concebidos como dois mundos distintos. O Seialz nasceu para ser um só.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ─── A SOLUÇÃO ─── */}
      <section id="solucao" className="py-24 md:py-32 relative" style={{ backgroundColor: C.paper }}>
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{ backgroundImage: `url(${linhasSutil.url})`, opacity: 0.5 }}
        />
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// A Solução</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-extrabold text-2xl md:text-4xl leading-tight mb-6"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Uma plataforma onde marketing e vendas operam{" "}
              <span style={{ color: C.green }}>sobre o mesmo dado.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg leading-relaxed mb-12 max-w-4xl"
              style={{ color: C.soft }}
            >
              A desconexão entre marketing e vendas não se resolve com mais uma integração. Resolve-se com um sistema
              concebido, desde a origem, para tratar os dois como uma operação única.
            </motion.p>

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
                  className="p-8 relative overflow-hidden transition-all hover:-translate-y-0.5"
                  style={{
                    ...cardBase,
                    backgroundColor: C.snow,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 18px 50px rgba(10,10,10,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: C.green }} />
                  <div className="pl-4">
                    <span
                      className="text-[10px] uppercase mb-3 block font-bold"
                      style={{ color: C.forest, fontFamily: "'Space Mono', monospace", letterSpacing: "3px" }}
                    >
                      {p.num}
                    </span>
                    <h4 className="font-extrabold text-lg mb-3" style={{ color: C.ink }}>
                      {p.title}
                    </h4>
                    <p className="text-sm leading-relaxed" style={{ color: C.soft }}>
                      {p.desc}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── O LOOP ─── */}
      <section id="loop" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
        <div className="max-w-4xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// O Loop</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-extrabold text-2xl md:text-4xl leading-tight mb-6"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Um ciclo que se aprimora <span style={{ color: C.green }}>a cada venda.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-12 max-w-4xl" style={{ color: C.soft }}>
              Quando marketing e vendas compartilham os mesmos dados de forma nativa, estabelece-se uma dinâmica
              virtuosa: cada venda orienta o marketing a captar leads melhores, e cada lead qualificado facilita a venda
              seguinte.
            </motion.p>

            <motion.div variants={fadeUp}>
              {[
                { n: "01", t: "Marketing executa a campanha → o lead ingressa no Seialz automaticamente, com origem rastreada." },
                { n: "02", t: "A IA direciona ao vendedor adequado, segundo regras e performance → cada interação é registrada." },
                { n: "03", t: "O lead se converte (ou não) → o resultado retorna ao marketing com contexto completo: motivo de perda, ticket, tempo de ciclo." },
                { n: "04", t: "Marketing otimiza com dados de receita real → o algoritmo aprende → melhores leads ingressam → vendas convertem mais." },
                { n: "05", t: "O ciclo se repete. A cada rodada, o sistema compreende com maior precisão o que funciona — e o que não funciona." },
              ].map((s) => (
                <div
                  key={s.n}
                  className="flex items-start gap-6 py-6"
                  style={{ borderBottom: `1px solid ${C.line}` }}
                >
                  <span
                    className="font-extrabold text-2xl flex-shrink-0 w-14"
                    style={{ color: C.green, fontFamily: "'Space Mono', monospace" }}
                  >
                    {s.n}
                  </span>
                  <p className="leading-relaxed pt-1" style={{ color: C.soft }}>
                    {s.t}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── POR QUE NATIVO ─── */}
      <section id="por-que-nativo" className="py-24 md:py-32 relative" style={{ backgroundColor: C.snow }}>
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{ backgroundImage: `url(${linhasSutil.url})`, opacity: 0.45 }}
        />
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.div variants={fadeUp}>
              <SectionTag>// Por Que "Nativo" Importa</SectionTag>
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="font-extrabold text-2xl md:text-4xl leading-tight mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Qualquer sistema integra. <span style={{ color: C.green }}>Nenhum nasceu unificado.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-6 text-lg leading-relaxed" style={{ color: C.soft }}>
              <p>
                O mercado tenta resolver a desconexão entre marketing e vendas conectando ferramentas concebidas
                separadamente. Meta Ads de um lado, CRM do outro, e uma camada de integração no meio tentando
                reconciliar tudo.
              </p>
              <p>
                A consequência é conhecida: integrações são frágeis, APIs falham, o dado atrasa e a atribuição fica
                incompleta. No momento em que o número é mais necessário, ele não é confiável.
              </p>

              <blockquote
                className="text-xl md:text-2xl font-semibold leading-snug pl-6 my-8"
                style={{ color: C.ink, borderLeft: `3px solid ${C.green}` }}
              >
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
      <section id="cta" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
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
              className="font-extrabold text-3xl md:text-5xl leading-tight mb-4"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Marketing e vendas, <span style={{ color: C.green }}>sobre o mesmo dado.</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg mb-12 max-w-2xl mx-auto" style={{ color: C.soft }}>
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
