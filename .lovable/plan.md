

## Copy Update — Landing Page "Sales Ops Nativo"

Copy-only changes across 3 files. No structural/layout changes, just text content updates.

### Files to change

**1. `src/components/landing/LandingNavbar.tsx`**
- Update `navLinks` to: O Problema, Solução, O Loop, O Que Recebe, Pra Quem, Por Que Nativo (remove "Como Funciona" and "Resultados")
- Add "SALES OPS NATIVO" tag next to logo
- Nav CTA text: "Diagnóstico" (shorter)

**2. `src/components/landing/LandingFooter.tsx`**
- Change footer text from "Todos os direitos reservados" to "Sales Ops Nativo · © 2026"

**3. `src/pages/LandingPage.tsx`** — Major copy rewrite:

- **Hero**: Tag → `// sales ops nativo`. Headline → "Marketing e vendas **nunca deveriam ter sido separados.**" New subtitle about native data. Add secondary paragraph about "empresas de serviço". CTA note updated.

- **Add Proof Stats bar** (new section after hero): 8.7x / $250k / 15k+ / 24 with labels. Footnote about real operation data.

- **O Problema**: Keep headline. Split body into two paragraphs. Add versus comparison grid (API vs Nativo) with red/green styling. Add closing paragraph.

- **A Solução**: Headline → "Não é só software. Não é só consultoria. É a operação inteira." New subtitle. Update 3 pilares copy (Tecnologia/Processo/Acompanhamento with expanded descriptions). Remove loop visual from this section.

- **Add O Loop section** (new, id="loop"): Headline "O ciclo que fica mais inteligente a cada venda." Subtitle about native data sharing. 5 numbered steps with new expanded copy.

- **O Que Recebe**: Headline → "Tudo que sua operação precisa. Nada que não precisa." Subtitle about no freelancers/generic CRM. Update 8 feature cards copy (remove "Diretor Comercial Dedicado" card, keep 8 features with updated descriptions).

- **Pra Quem**: Headline → "Empresas de serviço que vendem por **atendimento direto.**" New subtitle. Replace 12 segment pills with 4 specific segments with proof text. Update stats to: 2-50 / ROI / 1. Add closing line.

- **Add "Por Que Nativo" section** (new, id="por-que-nativo"): Manifesto copy about why native matters. Highlighted quote block.

- **Remove "Como Funciona" section** (lines 255-288)
- **Remove "Resultados" section** (lines 290-318)

- **CTA Final**: Headline → "Quer saber onde sua operação está **deixando dinheiro na mesa?**" Subtitle updated. Keep form as-is.

