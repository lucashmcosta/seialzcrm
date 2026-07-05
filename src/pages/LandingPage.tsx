import { useState } from "react";
import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";
import linhasMedia from "@/assets/brand/linhas-media-light.svg.asset.json";
import linhasSutil from "@/assets/brand/linhas-sutil-light.svg.asset.json";
import { useSiteT } from "@/i18n/SiteI18nProvider";
import { SiteSeo } from "@/i18n/SiteSeo";

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

interface LoopStep {
  title: string;
  description: string;
}

export default function LandingPage() {
  const { t, locale } = useSiteT("home");
  const [form, setForm] = useState({ nome: "", email: "", empresa: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const steps = t<LoopStep[]>("loop.steps");
  const labels = t<{ name: string; email: string; company: string }>("cta.labels");

  const fields: { k: keyof typeof form; label: string; type: string }[] = [
    { k: "nome", label: labels.name, type: "text" },
    { k: "email", label: labels.email, type: "email" },
    { k: "empresa", label: labels.company, type: "text" },
  ];

  return (
    <div
      className="overflow-x-hidden overflow-y-auto"
      style={{ backgroundColor: C.paper, color: C.ink, fontFamily: "'Sora', sans-serif", height: "100dvh" }}
    >
      <SiteSeo
        locale={locale}
        title={t("seo.title")}
        description={t("seo.description")}
        pathWithoutLocale=""
      />

      <LandingNavbar />

      {/* HERO */}
      <section className="relative pt-32 pb-28 md:pt-44 md:pb-40">
        <div
          className="absolute inset-0 pointer-events-none bg-center bg-cover"
          style={{
            backgroundImage: `url(${linhasMedia.url})`,
            opacity: 0.75,
            maskImage:
              "radial-gradient(ellipse 75% 65% at center, transparent 0%, rgba(0,0,0,0.55) 55%, black 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 65% at center, transparent 0%, rgba(0,0,0,0.55) 55%, black 100%)",
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
              {t("hero.titleLead")}{" "}
              <span style={{ color: C.green }}>{t("hero.titleAccent")}</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-relaxed"
              style={{ color: C.soft }}
            >
              {t("hero.subtitle")}
            </motion.p>
            <motion.div variants={fadeUp}>
              <a
                href="#cta"
                className="px-8 py-4 rounded-[10px] text-base font-semibold inline-flex items-center justify-center transition-all hover:scale-105"
                style={{
                  backgroundColor: C.green,
                  color: C.ink,
                  fontFamily: "'Sora', sans-serif",
                  boxShadow: "0 8px 24px rgba(50,205,50,0.25)",
                }}
              >
                {t("hero.cta")}
              </a>
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
              {t("problem.titleLead")}{" "}
              <span style={{ color: C.green }}>{t("problem.titleAccent")}</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed" style={{ color: C.soft }}>
              {t("problem.body")}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* A SOLUÇÃO */}
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
              {t("solution.titleLead")}{" "}
              <span style={{ color: C.green }}>{t("solution.titleAccent")}</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed" style={{ color: C.soft }}>
              {t("solution.body")}
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
              {t("loop.titleLead")}{" "}
              <span style={{ color: C.green }}>{t("loop.titleAccent")}</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-12" style={{ color: C.soft }}>
              {t("loop.body")}
            </motion.p>

            <motion.div variants={fadeUp} className="space-y-0">
              {steps.map((s) => (
                <div
                  key={s.title}
                  className="flex items-baseline gap-5 py-5"
                  style={{ borderTop: `1px solid ${C.line}` }}
                >
                  <span className="font-semibold text-base flex-shrink-0 w-32" style={{ color: C.ink }}>
                    {s.title}
                  </span>
                  <p className="leading-relaxed text-base" style={{ color: C.soft }}>
                    {s.description}
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
              {t("cta.titleLead")}{" "}
              <span style={{ color: C.green }}>{t("cta.titleAccent")}</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-10 text-center" style={{ color: C.soft }}>
              {t("cta.subtitle")}
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
                  {t("cta.success")}
                </p>
              ) : (
                <>
                  {fields.map((f) => (
                    <div key={f.k}>
                      <label className="block text-xs mb-2 font-medium" style={{ color: C.soft }}>
                        {f.label}
                      </label>
                      <input
                        required
                        type={f.type}
                        value={form[f.k]}
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
                      className="w-full py-4 rounded-[10px] text-base font-semibold transition-all hover:scale-[1.01]"
                      style={{
                        backgroundColor: C.green,
                        color: C.ink,
                        fontFamily: "'Sora', sans-serif",
                        boxShadow: "0 8px 24px rgba(50,205,50,0.25)",
                      }}
                    >
                      {t("cta.submit")}
                    </button>
                    <p className="text-xs text-center mt-4" style={{ color: C.ash }}>
                      {t("cta.disclaimer")}
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
