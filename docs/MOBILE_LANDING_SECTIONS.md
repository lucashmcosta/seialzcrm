# Mobile Landing — Seções pós-Hero

Referência de código/conteúdo/visual para replicar as seções da landing page (`src/pages/LandingPage.tsx`) no app mobile. Nada de lógica de negócio — apenas markup, textos pt-BR e tokens visuais.

---

## 1. Tokens compartilhados

```ts
const C = {
  paper:  "#FFFFFF",
  snow:   "#F6F7F6",
  ink:    "#0A0A0A",
  green:  "#32CD32",
  forest: "#1E7A1E",
  soft:   "#4A4D4A",
  ash:    "#7A7E7A",
  line:   "#E6E8E6",
};

const fadeUp = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };
```

- **Fonte global:** `'Sora', sans-serif`
- **Pesos usados:** `500` (nav/links), `600` (títulos, botões, labels em destaque)
- **Letter-spacing títulos:** `-0.02em`

---

## 2. Assets referenciados

| Uso | Arquivo |
|---|---|
| Textura de fundo — Solução, CTA | `src/assets/brand/linhas-media-light.svg.asset.json` |
| Textura de fundo — Solução (mais sutil) | `src/assets/brand/linhas-sutil-light.svg.asset.json` |
| Logo footer | `src/assets/brand/seialz-logo-color.png.asset.json` |

Nenhum ícone/ilustração inline — as seções são puramente tipográficas + texturas SVG de fundo.

---

## 3. Animações (resumo)

Todas as seções abaixo usam o mesmo padrão Framer Motion:

> **Fade + slide up** (y: 30→0, opacity: 0→1, duração 0.6s, ease-out) ao entrar no viewport (`whileInView`, `once: true`, `amount: 0.3`), com **stagger de 0.1s** entre filhos diretos.

Adaptar no mobile com Reanimated / `Animated.View` + `useAnimatedStyle` disparado por `IntersectionObserver` equivalente (ex.: `onLayout` + scroll offset, ou `react-native-reanimated` `FadeInDown`).

---

## 4. Componente base repetido — Item da lista do Loop

```tsx
<div
  className="flex items-baseline gap-5 py-5"
  style={{ borderTop: `1px solid ${C.line}` }}
>
  <span
    className="font-semibold text-base flex-shrink-0 w-32"
    style={{ color: C.ink }}
  >
    {step.title}
  </span>
  <p className="leading-relaxed text-base" style={{ color: C.soft }}>
    {step.description}
  </p>
</div>
```

- Linha superior `1px` cor `#E6E8E6`
- Título em coluna fixa `128px` (`w-32`), peso 600, cor `#0A0A0A`
- Descrição flexível, cor `#4A4D4A`
- Padding vertical `20px` (`py-5`), gap `20px` (`gap-5`)

---

## 5. Seção "O problema"

**Textos exatos (pt-BR):**

- **Título (lead):** "Quando marketing e vendas operam separados,"
- **Título (accent — verde):** "a receita perde clareza."
- **Corpo:** "Uma área acompanha o custo por lead, a outra acompanha a conversão, e os dados raramente conversam entre si. Sem uma visão única, fica difícil saber o que realmente gera resultado — e as decisões passam a depender mais de percepção do que de dados."

```tsx
<section id="problema" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
  <div className="max-w-3xl mx-auto px-6">
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={stagger}
    >
      <motion.h2
        variants={fadeUp}
        className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
        style={{ color: C.ink, letterSpacing: "-0.02em" }}
      >
        Quando marketing e vendas operam separados,{" "}
        <span style={{ color: C.green }}>a receita perde clareza.</span>
      </motion.h2>
      <motion.p variants={fadeUp} className="text-lg leading-relaxed" style={{ color: C.soft }}>
        Uma área acompanha o custo por lead, a outra acompanha a conversão, e os dados raramente conversam entre si. Sem uma visão única, fica difícil saber o que realmente gera resultado — e as decisões passam a depender mais de percepção do que de dados.
      </motion.p>
    </motion.div>
  </div>
</section>
```

---

## 6. Seção "A solução"

**Textos exatos (pt-BR):**

- **Título (lead):** "Uma operação comercial sobre"
- **Título (accent — verde):** "o mesmo dado."
- **Corpo:** "O Seialz trata marketing e vendas como uma operação única. Cada lead entra com a origem registrada, avança pelo pipeline e tem sua receita conectada à campanha que o gerou. O resultado é uma fonte de verdade em tempo real, em que marketing e vendas enxergam exatamente a mesma informação."

**Detalhes visuais:** fundo `#F6F7F6` (snow), bordas topo/base `1px #E6E8E6`, textura `linhas-sutil-light.svg` com `opacity: 0.35` cobrindo a seção inteira (`bg-center bg-cover`, `pointer-events-none`).

```tsx
<section
  id="solucao"
  className="py-28 md:py-36 relative"
  style={{
    backgroundColor: C.snow,
    borderTop: `1px solid ${C.line}`,
    borderBottom: `1px solid ${C.line}`,
  }}
>
  <div
    className="absolute inset-0 pointer-events-none bg-center bg-cover"
    style={{ backgroundImage: `url(${linhasSutil.url})`, opacity: 0.35 }}
  />
  <div className="max-w-3xl mx-auto px-6 relative z-10">
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={stagger}
    >
      <motion.h2
        variants={fadeUp}
        className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
        style={{ color: C.ink, letterSpacing: "-0.02em" }}
      >
        Uma operação comercial sobre{" "}
        <span style={{ color: C.green }}>o mesmo dado.</span>
      </motion.h2>
      <motion.p variants={fadeUp} className="text-lg leading-relaxed" style={{ color: C.soft }}>
        O Seialz trata marketing e vendas como uma operação única. Cada lead entra com a origem registrada, avança pelo pipeline e tem sua receita conectada à campanha que o gerou. O resultado é uma fonte de verdade em tempo real, em que marketing e vendas enxergam exatamente a mesma informação.
      </motion.p>
    </motion.div>
  </div>
</section>
```

---

## 7. Seção "O loop"

**Textos exatos (pt-BR):**

- **Título (lead):** "Um ciclo que evolui"
- **Título (accent — verde):** "a cada venda."
- **Corpo:** "Com marketing e vendas sobre o mesmo dado, cada negócio fechado retorna como informação para a operação. O marketing entende quais campanhas geram receita, atrai leads mais qualificados, e a equipe comercial converte com mais consistência. A cada ciclo, a operação fica mais precisa."

**Lista completa de steps (3 itens — são só esses três):**

| # | Título | Descrição |
|---|---|---|
| 1 | **Origem** | o lead entra com a campanha de origem registrada. |
| 2 | **Conversão** | cada interação é acompanhada até o fechamento. |
| 3 | **Aprendizado** | o resultado retorna e orienta as próximas campanhas. |

```tsx
const steps = [
  { title: "Origem",       description: "o lead entra com a campanha de origem registrada." },
  { title: "Conversão",    description: "cada interação é acompanhada até o fechamento." },
  { title: "Aprendizado",  description: "o resultado retorna e orienta as próximas campanhas." },
];

<section id="loop" className="py-24 md:py-32" style={{ backgroundColor: C.paper }}>
  <div className="max-w-3xl mx-auto px-6">
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={stagger}
    >
      <motion.h2
        variants={fadeUp}
        className="font-semibold text-3xl md:text-5xl leading-tight mb-8"
        style={{ color: C.ink, letterSpacing: "-0.02em" }}
      >
        Um ciclo que evolui{" "}
        <span style={{ color: C.green }}>a cada venda.</span>
      </motion.h2>
      <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-12" style={{ color: C.soft }}>
        Com marketing e vendas sobre o mesmo dado, cada negócio fechado retorna como informação para a operação. O marketing entende quais campanhas geram receita, atrai leads mais qualificados, e a equipe comercial converte com mais consistência. A cada ciclo, a operação fica mais precisa.
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
```

---

## 8. Seção "CTA / Contato"

**Textos exatos (pt-BR):**

- **Título (lead):** "Vamos conversar sobre"
- **Título (accent — verde):** "sua operação."
- **Subtítulo:** "Conte um pouco sobre sua empresa e nosso time entra em contato."
- **Labels do form:** "Nome" · "E-mail" · "Empresa"
- **Botão submit:** "Falar com a Seialz"
- **Disclaimer:** "Retornamos em até 24h."
- **Mensagem de sucesso:** "Recebemos seu contato. Retornamos em até 24h."

**Detalhes visuais:**

- Card branco com `border 1px #E6E8E6`, `border-radius: 18px`, `box-shadow: 0 10px 40px rgba(10,10,10,0.04)`, padding `40px`.
- Inputs: fundo `#F6F7F6`, `border 1px #E6E8E6`, `border-radius: 12px`, padding `12px 16px`. Focus muda border para verde `#32CD32`.
- Botão: verde `#32CD32`, texto `#0A0A0A`, `border-radius: 10px`, `box-shadow: 0 8px 24px rgba(50,205,50,0.25)`, hover scale 1.01.
- Fundo da seção com textura `linhas-media-light.svg` (opacity 0.35) mascarada por radial-gradient elíptico central.

```tsx
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
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={stagger}
    >
      <motion.h2
        variants={fadeUp}
        className="font-semibold text-3xl md:text-5xl leading-tight mb-6 text-center"
        style={{ color: C.ink, letterSpacing: "-0.02em" }}
      >
        Vamos conversar sobre{" "}
        <span style={{ color: C.green }}>sua operação.</span>
      </motion.h2>
      <motion.p variants={fadeUp} className="text-lg leading-relaxed mb-10 text-center" style={{ color: C.soft }}>
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
              { k: "nome",    label: "Nome",    type: "text" },
              { k: "email",   label: "E-mail",  type: "email" },
              { k: "empresa", label: "Empresa", type: "text" },
            ].map((f) => (
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
```

---

## 9. Footer

**Textos exatos (pt-BR, de `src/locales/pt-BR/common.json`):**

- **Tagline:** "Sales Ops Nativo"
- **Copyright:** "© {ano atual}" (concatenado à tagline com `·`)
- **Links:** "Política de Privacidade" · "Termos de Serviço" · "Exclusão de Dados" · "Contato"
- **Language switcher:** "PT | EN" (ativo em verde `#32CD32`, inativo `#7A7E7A`)

**Detalhes visuais:**

- Fundo `#F6F7F6` (snow), borda topo `1px #E6E8E6`.
- Padding vertical `40px` (`py-10`).
- Logo `28px` altura.
- Links `#7A7E7A`, hover vira verde `#32CD32` (transition 0.2s).
- Layout: coluna no mobile, row no desktop (`md:flex-row md:items-center md:justify-between`).

```tsx
// src/components/landing/LandingFooter.tsx (completo, adaptado com textos inline)

import { Link } from 'react-router-dom';
import logoBlack from '@/assets/brand/seialz-logo-color.png.asset.json';

const SNOW  = '#F6F7F6';
const LINE  = '#E6E8E6';
const ASH   = '#7A7E7A';
const GREEN = '#32CD32';

export function LandingFooter() {
  const linkStyle = { color: ASH, transition: 'color 0.2s ease' } as const;
  const onEnter = (e) => { e.currentTarget.style.color = GREEN; };
  const onLeave = (e) => { e.currentTarget.style.color = ASH; };

  return (
    <footer
      style={{
        backgroundColor: SNOW,
        borderTop: `1px solid ${LINE}`,
        fontFamily: "'Sora', sans-serif",
      }}
      className="py-10"
    >
      <div className="max-w-7xl mx-auto px-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link to="/pt-br" aria-label="Seialz">
            <img src={logoBlack.url} alt="Seialz" style={{ height: 28, width: 'auto', display: 'block' }} />
          </Link>
          <p className="text-sm" style={{ color: ASH }}>
            Sales Ops Nativo · © {new Date().getFullYear()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" style={{ color: ASH }}>
          <Link to="/politica-de-privacidade" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            Política de Privacidade
          </Link>
          <Link to="/termos-de-servico" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            Termos de Serviço
          </Link>
          <Link to="/exclusao-de-dados" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            Exclusão de Dados
          </Link>
          <a href="/pt-br#cta" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            Contato
          </a>
          <span aria-hidden style={{ color: LINE }}>·</span>
          {/* Language switcher: "PT | EN" — ativo verde, inativo ash */}
        </div>
      </div>
    </footer>
  );
}
```

**Language switcher (componente base — renderiza `PT | EN`):**

```tsx
// Botões inline, sem border, apenas mudança de cor + peso
// Ativo:   color #32CD32, fontWeight 700, cursor default
// Inativo: color #7A7E7A, fontWeight 500, cursor pointer
// Separador "|" com color #7A7E7A opacity 0.6
```

---

## Ordem final da página (para referência de scroll)

1. **Navbar** (fixo, `#FFFFFF` com `backdrop-blur(14px)`, altura 64px)
2. **Hero** (já entregue anteriormente)
3. **Problema** — §5
4. **Solução** — §6
5. **Loop** — §7
6. **CTA / Contato** — §8
7. **Footer** — §9

Todas as seções são full-width com container interno `max-w-3xl` (§5-7) ou `max-w-2xl` (§8), padrão `px-6`. Padding vertical varia entre `py-24 md:py-32` (Problema, Loop) e `py-28 md:py-36` (Solução, CTA).
