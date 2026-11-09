/**
 * Motor da calculadora da Central Trabalhista (puro, sem I/O).
 * Testado em tests/labor-center*.test.ts.
 */
export * from './engine';
export * from './facts';
export { brl, fmtNum, parseNum } from './money';
export { fmtDate, todayYMD, toDate } from './dates';
export { parseTime, fmtTime } from './jornada';
export type { Line } from './reflexes';
export { TERMINATION_LABEL, type Termination } from './prescription';
