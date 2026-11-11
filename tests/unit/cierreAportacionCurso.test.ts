import { describe, it, expect } from 'vitest';
import {
  tipoAportacionCurso,
  importePropuesto,
  confirmarImporte,
} from '../../src/lib/cierreAportacionCurso';

describe('tipoAportacionCurso', () => {
  it('curso histórico sin tipo es variable', () => {
    expect(tipoAportacionCurso({})).toBe('variable');
  });
  it('respeta fija', () => {
    expect(tipoAportacionCurso({ tipoAportacion: 'fija' })).toBe('fija');
  });
  it('valor desconocido cae a variable', () => {
    expect(tipoAportacionCurso({ tipoAportacion: 'otra' })).toBe('variable');
  });
});

describe('importePropuesto', () => {
  it('curso fijo propone el fijo aunque no haya pagos del profesor', () => {
    expect(importePropuesto({ tipoAportacion: 'fija', aportacionFijaMensual: 150 }, 0))
      .toEqual({ importe: 150, origen: 'fijo' });
  });
  it('curso fijo ignora lo marcado por el profesor', () => {
    expect(importePropuesto({ tipoAportacion: 'fija', aportacionFijaMensual: 150 }, 80))
      .toEqual({ importe: 150, origen: 'fijo' });
  });
  it('curso fijo sin importe configurado pide importe manual', () => {
    expect(importePropuesto({ tipoAportacion: 'fija' }, 0)).toEqual({ importe: null, origen: 'manual' });
  });
  it('curso variable con pagos propone la suma', () => {
    expect(importePropuesto({}, 80)).toEqual({ importe: 80, origen: 'pagos_profesor' });
  });
  it('curso variable sin pagos pide importe manual', () => {
    expect(importePropuesto({ tipoAportacion: 'variable' }, 0)).toEqual({ importe: null, origen: 'manual' });
  });
});

describe('confirmarImporte', () => {
  const fijo = { importe: 150, origen: 'fijo' as const };
  const vacio = { importe: null, origen: 'manual' as const };

  it('aceptar el propuesto conserva el origen', () => {
    expect(confirmarImporte('150', fijo)).toEqual({ importe: 150, origen: 'fijo' });
  });
  it('cambiar el importe lo marca como manual', () => {
    expect(confirmarImporte('120', fijo)).toEqual({ importe: 120, origen: 'manual' });
  });
  it('importe escrito a mano sin propuesta', () => {
    expect(confirmarImporte(' 60 ', vacio)).toEqual({ importe: 60, origen: 'manual' });
  });
  it('acepta coma decimal', () => {
    expect(confirmarImporte('62,5', vacio)).toEqual({ importe: 62.5, origen: 'manual' });
  });
  it.each([null, '', '   ', '0', '-10', 'abc'])('rechaza %j', (v) => {
    expect(confirmarImporte(v, vacio)).toBeNull();
  });
});
