import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// El getter lazy permite que _db se asigne en beforeAll antes de cualquier llamada
let _db: any;
vi.mock('../../src/firebase', () => ({ get db() { return _db; } }));

import { syncSocioStatus } from '../../src/lib/socioService';

const PERMISSIVE_RULES = `
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} { allow read, write: if true; }
    }
  }
`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-kalian',
    firestore: { host: 'localhost', port: 8080, rules: PERMISSIVE_RULES },
  });
  _db = testEnv.unauthenticatedContext().firestore();
});

afterAll(async () => { await testEnv.cleanup(); });

// Helpers de fechas relativas a hoy
const MAÑANA = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
const PASADO = '2000-01-01';
const hoy = new Date();
const MES_ACTUAL = `${hoy.getFullYear()}_${hoy.getMonth() + 1}`;
const MES_ANTERIOR = hoy.getMonth() === 0
  ? `${hoy.getFullYear() - 1}_12`
  : `${hoy.getFullYear()}_${hoy.getMonth()}`;
const MES_HACE_DOS = hoy.getMonth() <= 1
  ? `${hoy.getFullYear() - 1}_${12 - (1 - hoy.getMonth())}`
  : `${hoy.getFullYear()}_${hoy.getMonth() - 1}`;

const seed = {
  socio: (id: string, data: Record<string, unknown>) =>
    setDoc(doc(_db, 'socios', id), { estado: 'inactivo', ...data }),
  curso: (id: string, data: Record<string, unknown>) =>
    setDoc(doc(_db, 'cursos', id), data),
  local: (id: string, data: Record<string, unknown>) =>
    setDoc(doc(_db, 'locales', id), data),
};

async function estadoActual(id: string) {
  return (await getDoc(doc(_db, 'socios', id))).data()?.estado;
}

describe('syncSocioStatus', () => {
  it('A: curso con fechaFin futura → activo', async () => {
    await seed.curso('C1', { fechaFin: MAÑANA, alumnos: ['S1'] });
    await seed.socio('S1', { cursos: ['C1'] });
    await syncSocioStatus('S1');
    expect(await estadoActual('S1')).toBe('activo');
  });

  it('B: curso con fechaFin pasada → inactivo', async () => {
    await seed.curso('C2', { fechaFin: PASADO, alumnos: ['S2'] });
    await seed.socio('S2', { cursos: ['C2'], estado: 'activo' });
    await syncSocioStatus('S2');
    expect(await estadoActual('S2')).toBe('inactivo');
  });

  it('C: local con pago el mes actual → activo', async () => {
    await seed.local('L1', { ultimoPagoMesAnio: MES_ACTUAL });
    await seed.socio('S3', { localId: 'L1' });
    await syncSocioStatus('S3');
    expect(await estadoActual('S3')).toBe('activo');
  });

  it('D: local con pago el mes anterior (gracia) → activo', async () => {
    await seed.local('L2', { ultimoPagoMesAnio: MES_ANTERIOR });
    await seed.socio('S4', { localId: 'L2' });
    await syncSocioStatus('S4');
    expect(await estadoActual('S4')).toBe('activo');
  });

  it('E: local con pago de hace 2+ meses → inactivo', async () => {
    await seed.local('L3', { ultimoPagoMesAnio: MES_HACE_DOS });
    await seed.socio('S5', { localId: 'L3', estado: 'activo' });
    await syncSocioStatus('S5');
    expect(await estadoActual('S5')).toBe('inactivo');
  });

  it('F: curso con deletedAt no cuenta → inactivo', async () => {
    await seed.curso('C3', { fechaFin: MAÑANA, alumnos: ['S6'], deletedAt: new Date() });
    await seed.socio('S6', { cursos: ['C3'], estado: 'activo' });
    await syncSocioStatus('S6');
    expect(await estadoActual('S6')).toBe('inactivo');
  });
});
