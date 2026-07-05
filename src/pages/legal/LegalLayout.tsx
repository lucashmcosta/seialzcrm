import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";

const C = {
  paper: "#FFFFFF",
  ink: "#0A0A0A",
  soft: "#4A4D4A",
  line: "#E6E8E6",
  green: "#32CD32",
  ash: "#7A7E7A",
};

interface LegalLayoutProps {
  title: string;
  updatedLabel: string;
  updatedAt?: string;
  /** URL absoluta relativa para a versão da página no outro idioma. */
  altLanguageUrl?: string;
  altLanguageLabel?: string;
  currentLanguageLabel?: string;
  children: ReactNode;
}

export function LegalLayout({
  title,
  updatedLabel,
  updatedAt,
  altLanguageUrl,
  altLanguageLabel,
  currentLanguageLabel,
  children,
}: LegalLayoutProps) {
  return (
    <div
      className="overflow-x-hidden overflow-y-auto"
      style={{ backgroundColor: C.paper, color: C.ink, fontFamily: "'Sora', sans-serif", height: "100dvh" }}
    >
      <LandingNavbar />

      <section className="pt-32 md:pt-40 pb-8">
        <div className="max-w-3xl mx-auto px-6">
          {altLanguageUrl && altLanguageLabel && currentLanguageLabel && (
            <div className="mb-6 text-[13px] select-none" style={{ color: C.ash, fontFamily: "'Sora', sans-serif" }}>
              <span style={{ color: C.ink, fontWeight: 600 }}>{currentLanguageLabel}</span>
              <span aria-hidden className="mx-2" style={{ color: C.line }}>|</span>
              <Link
                to={altLanguageUrl}
                style={{ color: C.green, textDecoration: "none", fontWeight: 500 }}
                aria-label={`View in ${altLanguageLabel}`}
              >
                {altLanguageLabel}
              </Link>
            </div>
          )}
          <h1
            className="font-semibold text-4xl md:text-5xl leading-tight mb-4"
            style={{ color: C.ink, letterSpacing: "-0.02em" }}
          >
            {title}
          </h1>
          {updatedAt && (
            <p className="text-sm" style={{ color: C.soft }}>
              {updatedLabel}: <strong style={{ color: C.ink }}>{updatedAt}</strong>
            </p>
          )}
        </div>
      </section>

      <section className="pb-24">
        <div
          className="max-w-3xl mx-auto px-6 legal-content"
          style={{ color: C.soft, fontFamily: "'Sora', sans-serif" }}
        >
          {children}
        </div>
      </section>

      <LandingFooter />

      <style>{`
        .legal-content h1, .legal-content h2, .legal-content h3, .legal-content h4 {
          color: ${C.ink};
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          line-height: 1.25;
        }
        .legal-content h2 { scroll-margin-top: 6rem; }
        .legal-content h1 { font-size: 2rem; }
        .legal-content h2 { font-size: 1.5rem; }
        .legal-content h3 { font-size: 1.15rem; }
        .legal-content p, .legal-content li {
          font-size: 1rem;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .legal-content ul, .legal-content ol {
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .legal-content li { margin-bottom: 0.5rem; }
        .legal-content strong { color: ${C.ink}; font-weight: 600; }
        .legal-content a { color: ${C.green}; text-decoration: underline; }
        .legal-content hr { border: none; border-top: 1px solid ${C.line}; margin: 2.5rem 0; }
        .legal-content code {
          background: #F6F7F6;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-family: 'Space Mono', monospace;
          font-size: 0.9em;
          color: ${C.ink};
        }
        .legal-content table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 1.5rem;
        }
        .legal-content th, .legal-content td {
          border: 1px solid ${C.line};
          padding: 0.6rem 0.8rem;
          text-align: left;
          vertical-align: top;
        }
        .legal-content th { background: #F6F7F6; color: ${C.ink}; font-weight: 600; }
      `}</style>
    </div>
  );
}
