// Tipos mínimos do motor.mjs (gerado de packages/motor-classificacao; os tipos completos estão em src/tipos.ts).
// deno-lint-ignore-file no-explicit-any
export const MOTOR_VERSAO: string;
export const CALIBRACAO_V1: any;
export const CATALOGO: any;
export const PERGUNTAS: Record<string, any[]>;
export const PASSO_DADOS: any[];
export const PASSO_SAIDA: any[];
export function perguntasVisiveis(t: string, r: Record<string, unknown>, c: any): any[];
export function padraoDe(p: any, c: any): any;
export function calcularCaso(e: any, cal: any): any;
export function mesclarCalibracao(importada: unknown, base?: any): { calibracao: any; aplicados: number; ignorados: string[] };
export function conferirCalibracao(cal: any): string[];
export function compararCalibracoes(a: any, b: any): { caminho: string; rotulo: string; antes: unknown; depois: unknown }[];
