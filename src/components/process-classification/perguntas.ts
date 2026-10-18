// Perguntas do motor para o navegador do vendedor. Só perguntas, textos e condições: sem calibração,
// sem cálculo. O vite.config.ts troca o catálogo completo pelo reduzido (catalogoVendedor.ts).
// Nunca importar packages/motor-classificacao/src/index (levaria CALIBRACAO_V1 e calcularCaso ao bundle).
import * as P from '../../../packages/motor-classificacao/src/perguntas';
import { criarCanonicalizador, EntradaInvalida, type PerguntasApi } from '../../../supabase/functions/_shared/classificacao/canonicalizar';

export {
  AUTO_SEM_REGISTRO, AUTO_SEM_REGISTRO_SITUACAO, NOME_TESE, PASSO_DADOS, PASSO_SAIDA, PERGUNTAS, SAIDAS, TITULOS_PASSO,
  padraoDe, pendenciaDaTese, perguntasVisiveis,
} from '../../../packages/motor-classificacao/src/perguntas';
export type { CtxPergunta, Pergunta, PerguntaTopo } from '../../../packages/motor-classificacao/src/perguntas';
export type { TeseId } from '../../../packages/motor-classificacao/src/tipos';
export { EntradaInvalida };

/** O mesmo canonicalizador da edge: o que a tela envia é exatamente o que o servidor recalcula. */
export const { canonicalizar, respostasDaTese } = criarCanonicalizador(P as unknown as PerguntasApi);
