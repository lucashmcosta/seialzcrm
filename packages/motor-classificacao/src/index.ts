export * from './tipos';
export { calcularCaso, MOTOR_VERSAO, FAIXAS } from './motor';
export { PERGUNTAS, PASSO_DADOS, PASSO_SAIDA, SAIDAS, AUTO_SEM_REGISTRO, AUTO_SEM_REGISTRO_SITUACAO, MENSAGEM_FALTA, TITULOS_PASSO, NOME_TESE,
  perguntasVisiveis, padraoDe, pendenciaDaTese } from './perguntas';
export type { Pergunta, PerguntaTopo, CtxPergunta } from './perguntas';
/** Calibração inicial (v1). Substituir pelo JSON exportado do protótipo após a validação final. */
export { CALIBRACAO_V1 } from './calibracao-v1';
/** Rótulos e explicações (o "porquê" de cada número) — usados na tela de calibração do administrador. */
export { CATALOGO } from './catalogo';
export { mesclarCalibracao, conferirCalibracao, compararCalibracoes } from './calibracao';
export type { Mudanca } from './calibracao';
