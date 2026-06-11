import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

let _db: any;
vi.mock('../../src/firebase', () => ({ get db() { return _db; } }));

import { registrarIngreso } from '../../src/lib/finanzas';

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

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('registrarIngreso', () => {
  it('ID determinista: dos llamadas iguales producen un solo documento', async () => {
    const data = {
      monto: 15, concepto: 'Cuota junio', categoria: 'Socio' as const,
      metodo: 'Efectivo' as const, socio_id: 'S1', mes: 6, anio: 2026,
    };
    await registrarIngreso(data);
    await registrarIngreso(data);

    const todos = await getDocs(collection(_db, 'finanzas'));
    expect(todos.size).toBe(1);
    expect(todos.docs[0].id).toBe('CUOTA_2026_6_S1');
  });

  it('ID determinista: formato CUOTA_{anio}_{mes}_{socio_id}', async () => {
    await registrarIngreso({
      monto: 15, concepto: 'Cuota', categoria: 'cuota_socio' as any,
      metodo: 'Efectivo' as const, socio_id: 'ABC123', mes: 3, anio: 2026,
    });
    const snap = await getDoc(doc(_db, 'finanzas', 'CUOTA_2026_3_ABC123'));
    expect(snap.exists()).toBe(true);
  });

  it('Normalización: cuota_socio → Socio', async () => {
    await registrarIngreso({
      monto: 15, concepto: 'Cuota', categoria: 'cuota_socio' as any,
      metodo: 'Efectivo' as const, socio_id: 'S2', mes: 1, anio: 2026,
    });
    const snap = await getDoc(doc(_db, 'finanzas', 'CUOTA_2026_1_S2'));
    expect(snap.data()?.categoria).toBe('Socio');
    expect(snap.data()?.deletedAt).toBeNull();
  });

  it('No-cuota: genera doc con ID aleatorio (addDoc)', async () => {
    await registrarIngreso({
      monto: 50, concepto: 'Reserva evento', categoria: 'Evento',
      metodo: 'Tarjeta' as const,
    });
    const todos = await getDocs(collection(_db, 'finanzas'));
    expect(todos.size).toBe(1);
    expect(todos.docs[0].id).not.toMatch(/^CUOTA_/);
    expect(todos.docs[0].data().categoria).toBe('Evento');
  });
});
