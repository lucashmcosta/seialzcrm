import { describe, expect, it } from 'vitest';
import { nomeArquivoMaterial, recusaMaterial, tamanhoLegivel } from '../src/widgets/plamev-quote/materiais';

describe('materiais Plamev', () => {
  it('nome do arquivo legível no WhatsApp, sem acento nem símbolo', () => {
    expect(nomeArquivoMaterial('Coberturas ADVANCE (2026)', 'pdf')).toBe('Coberturas-ADVANCE-2026.pdf');
    expect(nomeArquivoMaterial('Comparativo – Plus x Básico', 'png')).toBe('Comparativo-Plus-x-Basico.png');
    expect(nomeArquivoMaterial('***', 'pdf')).toBe('material.pdf');
    expect(nomeArquivoMaterial('a'.repeat(100), 'pdf')).toBe(`${'a'.repeat(80)}.pdf`);
  });

  it('aceita PDF até 16 MB e imagem até 5 MB', () => {
    const MB = 1024 * 1024;
    expect(recusaMaterial({ type: 'application/pdf', size: 15 * MB })).toBeNull();
    expect(recusaMaterial({ type: 'application/pdf', size: 17 * MB })).toMatch(/16 MB/);
    expect(recusaMaterial({ type: 'image/png', size: 6 * MB })).toMatch(/5 MB/);
    expect(recusaMaterial({ type: 'video/mp4', size: 1 })).toMatch(/PDF, PNG/);
  });

  it('tamanho legível', () => {
    expect(tamanhoLegivel(1536 * 1024)).toBe('1,5 MB');
    expect(tamanhoLegivel(200)).toBe('1 KB');
  });
});
