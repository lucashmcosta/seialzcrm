/**
 * Motor da calculadora da Central Trabalhista (puro, sem I/O).
 * Testado em tests/labor-center*.test.ts.
 */
export * from './engine.ts';
export * from './facts.ts';
export { brl, fmtNum, parseNum } from './money.ts';
export { fmtDate, todayYMD, toDate } from './dates.ts';
export { parseTime, fmtTime } from './jornada.ts';
export type { Line } from './reflexes.ts';
export { TERMINATION_LABEL, type Termination } from './prescription.ts';
export { severanceClientText } from './clientText.ts';
