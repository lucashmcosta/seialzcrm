import { useState } from "react";
import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";
import linhasMedia from "@/assets/brand/linhas-media-light.svg.asset.json";
import linhasSutil from "@/assets/brand/linhas-sutil-light.svg.asset.json";

/* Brand tokens (Manual da Marca) */
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

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

function CtaButton({ full = false, children = "Falar com a Seialz" }: { full?: boolean; children?: string }) {
  return (
    <a
      href="#cta"
      className={`${full ? "w-full" : "px-8"} py-4 rounded-full text-base font-semibold inline-flex items-center justify-center transition-all hover:scale-105`}
      style={{
        backgroundColor: C.green,
        color: C.ink,
        fontFamily: "'Sora', sans-serif",
        boxShadow: "0 8px 24px rgba(50,205,50,0.25)",
      }}
    >
      {children}
    </a>
  );
}

export default function LandingPage() {
  const [form, setForm] = useState({ nome: "", email: "", empresa: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div
      className="overflow-x-hidden overflow-y-auto"
      style={{ backgroundColor: C.paper, color: C.ink, fontFamily: "'Sora', sans-serif", height: "100dvh" }}
    >
      <LandingNavbar />

      {/* HERO */}
      <section className="relative pt-32 pb-28 md:pt-44 md:pb-40">
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{
            backgroundImage: `url(${linhasMedia.url})`,
            opacity: 0.45,
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
            <motion.h1
              variants={fadeUp}
              className="font-semibold text-4xl md:text-6xl lg:text-7xl leading-[1.05] mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Marketing e vendas,{" "}
              <span style={{ color: C.green }}>em um único sistema.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-relaxed"
              style={{ color: C.soft }}
            >
              O Seialz conecta os dados de marketing e vendas desde o primeiro clique até a receita. Uma plataforma
              onde as duas áreas operam sobre a mesma informação — sem integrações, sem planilhas, sem ruído.
            </motion.p>
            <motion.div variants={fadeUp}>
              <CtaButton />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* O PROBLEMA */}
      <section id="problema" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.h2
              variants={fadeUp}
              className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Quando marketing e vendas operam separados,{" "}
              <span style={{ color: C.green }}>a receita perde clareza.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg leading-relaxed"
              style={{ color: C.soft }}
            >
              Uma área acompanha o custo por lead, a outra acompanha a conversão, e os dados raramente conversam
              entre si. Sem uma visão única, fica difícil saber o que realmente gera resultado — e as decisões
              passam a depender mais de percepção do que de dados.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* A SOLUÇÃO — ponto alto */}
      <section
        id="solucao"
        className="py-28 md:py-36 relative"
        style={{ backgroundColor: C.snow, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}
      >
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{ backgroundImage: `url(${linhasSutil.url})`, opacity: 0.35 }}
        />
        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.h2
              variants={fadeUp}
              className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Uma operação comercial sobre{" "}
              <span style={{ color: C.green }}>o mesmo dado.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg leading-relaxed"
              style={{ color: C.soft }}
            >
              O Seialz trata marketing e vendas como uma operação única. Cada lead entra com a origem registrada,
              avança pelo pipeline e tem sua receita conectada à campanha que o gerou. O resultado é uma fonte de
              verdade em tempo real, em que marketing e vendas enxergam exatamente a mesma informação.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* O LOOP */}
      <section id="loop" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.h2
              variants={fadeUp}
              className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Um ciclo que evolui{" "}
              <span style={{ color: C.green }}>a cada venda.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg leading-relaxed mb-12"
              style={{ color: C.soft }}
            >
              Com marketing e vendas sobre o mesmo dado, cada negócio fechado retorna como informação para a
              operação. O marketing entende quais campanhas geram receita, atrai leads mais qualificados, e a
              equipe comercial converte com mais consistência. A cada ciclo, a operação fica mais precisa.
            </motion.p>

            <motion.div variants={fadeUp} className="space-y-0">
              {[
                { t: "Origem", d: "o lead entra com a campanha de origem registrada." },
                { t: "Conversão", d: "cada interação é acompanhada até o fechamento." },
                { t: "Aprendizado", d: "o resultado retorna e orienta as próximas campanhas." },
              ].map((s) => (
                <div
                  key={s.t}
                  className="flex items-baseline gap-5 py-5"
                  style={{ borderTop: `1px solid ${C.line}` }}
                >
                  <span
                    className="font-semibold text-base flex-shrink-0 w-32"
                    style={{ color: C.ink }}
                  >
                    {s.t}
                  </span>
                  <p className="leading-relaxed text-base" style={{ color: C.soft }}>
                    {s.d}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CONTATO */}
      <section id="cta" className="py-28 md:py-36 relative" style={{ backgroundColor: C.paper }}>
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{
            backgroundImage: `url(${linhasMedia.url})`,
            opacity: 0.35,
            maskImage:
              "radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(0,0,0,0.4) 55%, black 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at center, transparent 0%, rgba(0,0,0,0.4) 55%, black 100%)",
          }}
        />
        <div className="max-w-2xl mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
            <motion.h2
              variants={fadeUp}
              className="font-semibold text-3xl md:text-5xl leading-tight mb-6 text-center"
              style={{ color: C.ink, letterSpacing: "-0.02em" }}
            >
              Vamos conversar sobre{" "}
              <span style={{ color: C.green }}>sua operação.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="text-lg leading-relaxed mb-10 text-center"
              style={{ color: C.soft }}
            >
              Conte um pouco sobre sua empresa e nosso time entra em contato.
            </motion.p>

            <motion.form
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="p-8 md:p-10 space-y-4"
              style={{
                backgroundColor: C.paper,
                border: `1px solid ${C.line}`,
                borderRadius: 18,
                boxShadow: "0 10px 40px rgba(10,10,10,0.04)",
              }}
            >
              {submitted ? (
                <p className="text-center py-8 text-base" style={{ color: C.ink }}>
                  Recebemos seu contato. Retornamos em até 24h.
                </p>
              ) : (
                <>
                  {[
                    { k: "nome", label: "Nome", type: "text" },
                    { k: "email", label: "E-mail", type: "email" },
                    { k: "empresa", label: "Empresa", type: "text" },
                  ].map((f) => (
                    <div key={f.k}>
                      <label className="block text-xs mb-2 font-medium" style={{ color: C.soft }}>
                        {f.label}
                      </label>
                      <input
                        required
                        type={f.type}
                        value={(form as any)[f.k]}
                        onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                        className="w-full px-4 py-3 text-base outline-none transition-colors"
                        style={{
                          backgroundColor: C.snow,
                          border: `1px solid ${C.line}`,
                          borderRadius: 12,
                          color: C.ink,
                          fontFamily: "'Sora', sans-serif",
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-4 rounded-full text-base font-semibold transition-all hover:scale-[1.01]"
                      style={{
                        backgroundColor: C.green,
                        color: C.ink,
                        fontFamily: "'Sora', sans-serif",
                        boxShadow: "0 8px 24px rgba(50,205,50,0.25)",
                      }}
                    >
                      Falar com a Seialz
                    </button>
                    <p className="text-xs text-center mt-4" style={{ color: C.ash }}>
                      Retornamos em até 24h.
                    </p>
                  </div>
                </>
              )}
            </motion.form>
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
