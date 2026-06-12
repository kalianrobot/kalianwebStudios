import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

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

describe('registrarIngreso', () => {
  it('ID determinista: dos llamadas iguales producen un solo documento', async () => {
    const data = {
      monto: 15, concepto: 'Cuota junio', categoria: 'Socio' as const,
      metodo: 'Efectivo' as const, socio_id: 'S1', mes: 6, anio: 2026,
    };
    await registrarIngreso(data);
    await registrarIngreso(data);

    const snap = await getDoc(doc(_db, 'finanzas', 'CUOTA_2026_6_S1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.monto).toBe(15);
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
    const marcador = `evento-${Date.now()}-${Math.random()}`;
    await registrarIngreso({
      monto: 50, concepto: marcador, categoria: 'Evento',
      metodo: 'Tarjeta' as const,
    });
    const res = await getDocs(query(collection(_db, 'finanzas'), where('concepto', '==', marcador)));
    expect(res.size).toBe(1);
    expect(res.docs[0].id).not.toMatch(/^CUOTA_/);
    expect(res.docs[0].data().categoria).toBe('Evento');
  });

  it('Cuota sin mes → addDoc (ID no determinista)', async () => {
    const marcador = `cuota-sin-mes-${Date.now()}`;
    await registrarIngreso({
      monto: 15, concepto: marcador, categoria: 'Socio' as const,
      metodo: 'Efectivo' as const, socio_id: 'S3',
      // mes ausente → no cumple condición determinista
    });
    const res = await getDocs(query(collection(_db, 'finanzas'), where('concepto', '==', marcador)));
    expect(res.size).toBe(1);
    expect(res.docs[0].id).not.toMatch(/^CUOTA_/);
  });

  it('Cuota sin socio_id → addDoc (ID no determinista)', async () => {
    const marcador = `cuota-sin-socio-${Date.now()}`;
    await registrarIngreso({
      monto: 15, concepto: marcador, categoria: 'Socio' as const,
      metodo: 'Efectivo' as const, mes: 6, anio: 2026,
      // socio_id ausente → no cumple condición determinista
    });
    const res = await getDocs(query(collection(_db, 'finanzas'), where('concepto', '==', marcador)));
    expect(res.size).toBe(1);
    expect(res.docs[0].id).not.toMatch(/^CUOTA_/);
  });

  it('Campos opcionales se persisten: local_id, cursoId, eventoId', async () => {
    await registrarIngreso({
      monto: 200, concepto: 'Aportación local enero', categoria: 'Aportación Socio Local',
      metodo: 'Transferencia' as const, local_id: 'LOC1', cursoId: 'CUR1', eventoId: 'EVT1',
    });
    const res = await getDocs(query(collection(_db, 'finanzas'), where('local_id', '==', 'LOC1')));
    expect(res.size).toBeGreaterThan(0);
    const data = res.docs[0].data();
    expect(data.cursoId).toBe('CUR1');
    expect(data.eventoId).toBe('EVT1');
    expect(data.metodo).toBe('Transferencia');
  });

  it('deletedAt se inicializa a null en addDoc', async () => {
    const marcador = `deletedAt-check-${Date.now()}`;
    await registrarIngreso({
      monto: 30, concepto: marcador, categoria: 'Curso',
      metodo: 'Efectivo' as const,
    });
    const res = await getDocs(query(collection(_db, 'finanzas'), where('concepto', '==', marcador)));
    expect(res.docs[0].data().deletedAt).toBeNull();
  });
});
