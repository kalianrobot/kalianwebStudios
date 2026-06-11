import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';

const PROJECT_ID = 'demo-kalian';
const MASTER_EMAIL = 'kalianrobot@gmail.com';

let testEnv: RulesTestEnvironment;

// ─── helpers ───────────────────────────────────────────────────────────────
const masterCtx  = () => testEnv.authenticatedContext('master-uid',  { email: MASTER_EMAIL });
const adminCtx   = () => testEnv.authenticatedContext('admin-uid',   { email: 'admin@kalian.es' });
const teacherCtx = () => testEnv.authenticatedContext('teacher-uid', { email: 'teacher@kalian.es' });
const socioCtx   = () => testEnv.authenticatedContext('socio-uid',   { email: 'jose@test.es' });
const socio2Ctx  = () => testEnv.authenticatedContext('socio2-uid',  { email: 'other@test.es' });
const anonCtx    = () => testEnv.unauthenticatedContext();

const db = (ctx: ReturnType<typeof masterCtx>) => ctx.firestore();

// ─── setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Seed: users collection (roles)
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'admin-uid'),   { role: 'admin' });
    await setDoc(doc(db, 'users', 'teacher-uid'), { role: 'teacher' });
    await setDoc(doc(db, 'users', 'socio-uid'),   { role: 'socio' });

    // Seed: evento de prueba
    await setDoc(doc(db, 'eventos', 'evt-1'), {
      titulo: 'Test Event',
      aforo_maximo: 50,
      aforo_reservado: 0,
    });

    // Seed: curso de prueba
    await setDoc(doc(db, 'cursos', 'cur-1'), {
      titulo: 'Curso Test',
      profesorId: 'teacher-uid',
      fechaFin: '2099-12-31',
      alumnos: [],
    });

    // Seed: reserva del socio
    await setDoc(doc(db, 'reservas', 'res-1'), {
      eventoId: 'evt-1',
      uidTitular: 'socio-uid',
      dniTitular: '12345678A',
      nombreTitular: 'Jose Test',
      emailTitular: 'jose@test.es',
      numPersonas: 2,
      acompañantes: 1,
    });

    // Seed: socio
    await setDoc(doc(db, 'socios', '12345678A'), {
      uid: 'socio-uid',
      email: 'jose@test.es',
      dni: '12345678A',
      nombre: 'Jose Test',
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  // No limpiamos datos entre tests para mantener el seed
});

// ══════════════════════════════════════════════════════════════════════════
// EVENTOS
// ══════════════════════════════════════════════════════════════════════════
describe('eventos', () => {
  it('anónimo puede leer', async () => {
    await assertSucceeds(getDoc(doc(db(anonCtx()), 'eventos', 'evt-1')));
  });

  it('socio puede leer', async () => {
    await assertSucceeds(getDoc(doc(db(socioCtx()), 'eventos', 'evt-1')));
  });

  it('anónimo NO puede crear', async () => {
    await assertFails(setDoc(doc(db(anonCtx()), 'eventos', 'evt-new'), {
      titulo: 'Hack', aforo_maximo: 100,
    }));
  });

  it('admin puede crear evento válido', async () => {
    await assertSucceeds(setDoc(doc(db(adminCtx()), 'eventos', 'evt-admin-create'), {
      titulo: 'Admin Event',
      aforo_maximo: 100,
      aforo_reservado: 0,
    }));
  });

  it('cualquiera puede actualizar solo aforo_reservado (para reservas)', async () => {
    await assertSucceeds(updateDoc(doc(db(anonCtx()), 'eventos', 'evt-1'), {
      aforo_reservado: 2,
    }));
  });

  it('socio NO puede cambiar el título de un evento', async () => {
    await assertFails(updateDoc(doc(db(socioCtx()), 'eventos', 'evt-1'), {
      titulo: 'Hacked',
    }));
  });

  it('socio NO puede borrar un evento', async () => {
    await assertFails(deleteDoc(doc(db(socioCtx()), 'eventos', 'evt-1')));
  });

  it('admin puede borrar un evento', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'eventos', 'evt-to-delete'), { titulo: 'Delete me', aforo_maximo: 10 });
    });
    await assertSucceeds(deleteDoc(doc(db(adminCtx()), 'eventos', 'evt-to-delete')));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RESERVAS
// ══════════════════════════════════════════════════════════════════════════
describe('reservas', () => {
  const reservaValida = {
    eventoId: 'evt-1',
    uidTitular: 'socio-uid',
    dniTitular: '12345678A',
    nombreTitular: 'Jose Test',
    emailTitular: 'jose@test.es',
    numPersonas: 1,
    acompañantes: 0,
  };

  it('socio puede crear su propia reserva', async () => {
    await assertSucceeds(addDoc(collection(db(socioCtx()), 'reservas'), reservaValida));
  });

  it('anónimo puede crear reserva como invitado', async () => {
    await assertSucceeds(addDoc(collection(db(anonCtx()), 'reservas'), {
      ...reservaValida,
      uidTitular: 'invitado',
      dniTitular: '99999999X',
    }));
  });

  it('NO se puede crear reserva con uidTitular de otro usuario', async () => {
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...reservaValida,
      uidTitular: 'socio2-uid', // uid diferente al autenticado
    }));
  });

  it('NO se puede crear reserva con numPersonas < 1', async () => {
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...reservaValida,
      numPersonas: 0,
    }));
  });

  it('titular puede leer su reserva', async () => {
    await assertSucceeds(getDoc(doc(db(socioCtx()), 'reservas', 'res-1')));
  });

  it('otro socio NO puede leer la reserva ajena', async () => {
    // res-1 pertenece a socio-uid (uid + email), socio2 no coincide en ninguna condición
    await assertFails(getDoc(doc(db(socio2Ctx()), 'reservas', 'res-1')));
  });

  it('titular puede actualizar solo acompañantes', async () => {
    await assertSucceeds(updateDoc(doc(db(socioCtx()), 'reservas', 'res-1'), {
      acompañantes: 2,
    }));
  });

  it('titular NO puede actualizar otros campos', async () => {
    await assertFails(updateDoc(doc(db(socioCtx()), 'reservas', 'res-1'), {
      nombreTitular: 'Hackeado',
    }));
  });

  it('titular puede cancelar (delete) su reserva', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'reservas', 'res-to-cancel'), {
        eventoId: 'evt-1', uidTitular: 'socio-uid', dniTitular: '12345678A',
        nombreTitular: 'Jose', emailTitular: 'jose@test.es', numPersonas: 1,
      });
    });
    await assertSucceeds(deleteDoc(doc(db(socioCtx()), 'reservas', 'res-to-cancel')));
  });

  it('otro socio NO puede cancelar reserva ajena', async () => {
    await assertFails(deleteDoc(doc(db(socio2Ctx()), 'reservas', 'res-1')));
  });

  it('admin puede update y delete cualquier reserva', async () => {
    await assertSucceeds(updateDoc(doc(db(adminCtx()), 'reservas', 'res-1'), { acompañantes: 0 }));
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'reservas', 'res-admin-del'), {
        eventoId: 'evt-1', uidTitular: 'x', dniTitular: '00000000X',
        nombreTitular: 'X', emailTitular: 'x@x.es', numPersonas: 1,
      });
    });
    await assertSucceeds(deleteDoc(doc(db(adminCtx()), 'reservas', 'res-admin-del')));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CURSOS
// ══════════════════════════════════════════════════════════════════════════
describe('cursos', () => {
  it('anónimo puede leer', async () => {
    await assertSucceeds(getDoc(doc(db(anonCtx()), 'cursos', 'cur-1')));
  });

  it('admin puede crear curso válido', async () => {
    await assertSucceeds(setDoc(doc(db(adminCtx()), 'cursos', 'cur-admin'), {
      titulo: 'Nuevo Curso', profesorId: 'teacher-uid', fechaFin: '2099-12-31',
    }));
  });

  it('teacher puede actualizar alumnos de su curso', async () => {
    await assertSucceeds(updateDoc(doc(db(teacherCtx()), 'cursos', 'cur-1'), {
      alumnos: ['12345678A'],
    }));
  });

  it('teacher NO puede actualizar titulo de su curso', async () => {
    await assertFails(updateDoc(doc(db(teacherCtx()), 'cursos', 'cur-1'), {
      titulo: 'Renamed',
    }));
  });

  it('socio NO puede crear curso', async () => {
    await assertFails(setDoc(doc(db(socioCtx()), 'cursos', 'hack'), {
      titulo: 'Hack',
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SOCIOS
// ══════════════════════════════════════════════════════════════════════════
describe('socios', () => {
  it('socio puede leer su propio perfil (por uid)', async () => {
    await assertSucceeds(getDoc(doc(db(socioCtx()), 'socios', '12345678A')));
  });

  it('socio NO puede leer perfil de otro socio', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'socios', '87654321B'), {
        uid: 'socio2-uid', email: 'other@test.es', dni: '87654321B',
      });
    });
    await assertFails(getDoc(doc(db(socioCtx()), 'socios', '87654321B')));
  });

  it('anónimo NO puede leer socios', async () => {
    await assertFails(getDoc(doc(db(anonCtx()), 'socios', '12345678A')));
  });

  it('admin puede leer cualquier socio', async () => {
    await assertSucceeds(getDoc(doc(db(adminCtx()), 'socios', '12345678A')));
  });

  it('socio NO puede modificar su propio perfil', async () => {
    await assertFails(updateDoc(doc(db(socioCtx()), 'socios', '12345678A'), {
      nombre: 'Hackeado',
    }));
  });

  it('admin puede modificar socios', async () => {
    await assertSucceeds(updateDoc(doc(db(adminCtx()), 'socios', '12345678A'), {
      estado: 'activo',
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FINANZAS
// ══════════════════════════════════════════════════════════════════════════
describe('finanzas', () => {
  it('admin puede leer y escribir finanzas', async () => {
    await assertSucceeds(setDoc(doc(db(adminCtx()), 'finanzas', 'f-1'), { monto: 100 }));
    await assertSucceeds(getDoc(doc(db(adminCtx()), 'finanzas', 'f-1')));
  });

  it('socio NO puede leer finanzas', async () => {
    await assertFails(getDoc(doc(db(socioCtx()), 'finanzas', 'f-1')));
  });

  it('teacher NO puede leer finanzas', async () => {
    await assertFails(getDoc(doc(db(teacherCtx()), 'finanzas', 'f-1')));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAGOS MENSUALES
// ══════════════════════════════════════════════════════════════════════════
describe('pagos_mensuales', () => {
  it('admin puede escribir', async () => {
    await assertSucceeds(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2026_5_12345678A'), {
      socioId: '12345678A', mes: 5, anio: 2026, pagado: true,
    }));
  });

  it('socio puede leer (para mostrar estado en perfil)', async () => {
    await assertSucceeds(getDoc(doc(db(socioCtx()), 'pagos_mensuales', '2026_5_12345678A')));
  });

  it('socio NO puede escribir pagos', async () => {
    await assertFails(setDoc(doc(db(socioCtx()), 'pagos_mensuales', '2026_5_hack'), {
      socioId: 'hack', mes: 5, anio: 2026, pagado: true,
    }));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// COLECCIONES PÚBLICAS (academias, profesores, locales, exposiciones)
// ══════════════════════════════════════════════════════════════════════════
describe('colecciones públicas', () => {
  for (const col of ['academias', 'profesores', 'locales', 'exposiciones']) {
    it(`${col}: anónimo puede leer`, async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), col, 'item-1'), { nombre: 'Test' });
      });
      await assertSucceeds(getDoc(doc(db(anonCtx()), col, 'item-1')));
    });

    it(`${col}: anónimo NO puede escribir`, async () => {
      await assertFails(setDoc(doc(db(anonCtx()), col, 'hack'), { nombre: 'Hack' }));
    });

    it(`${col}: admin puede escribir`, async () => {
      await assertSucceeds(setDoc(doc(db(adminCtx()), col, 'admin-item'), { nombre: 'Admin' }));
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// USERS — protección contra escalada de privilegios
// ══════════════════════════════════════════════════════════════════════════
describe('users / privilege escalation', () => {
  it('socio NO puede asignarse rol admin', async () => {
    await assertFails(updateDoc(doc(db(socioCtx()), 'users', 'socio-uid'), {
      role: 'admin',
    }));
  });

  it('socio NO puede crear su propio perfil con role=admin', async () => {
    await assertFails(setDoc(doc(db(socioCtx()), 'users', 'socio-uid'), {
      email: 'jose@test.es',
      role: 'admin',
    }));
  });

  it('socio puede actualizar campos propios sin tocar role', async () => {
    await assertSucceeds(updateDoc(doc(db(socioCtx()), 'users', 'socio-uid'), {
      nombre: 'Jose Actualizado',
    }));
  });

  it('admin puede cambiar el rol de otro usuario', async () => {
    await assertSucceeds(updateDoc(doc(db(adminCtx()), 'users', 'socio-uid'), {
      role: 'socio',
    }));
  });

  it('socio NO puede leer el perfil de otro usuario', async () => {
    await assertFails(getDoc(doc(db(socioCtx()), 'users', 'admin-uid')));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// MASTER ADMIN — acceso total
// ══════════════════════════════════════════════════════════════════════════
describe('master admin', () => {
  it('puede leer cualquier colección', async () => {
    await assertSucceeds(getDoc(doc(db(masterCtx()), 'finanzas', 'cualquier-id')));
    await assertSucceeds(getDoc(doc(db(masterCtx()), 'socios', '12345678A')));
  });

  it('puede escribir en cualquier colección', async () => {
    await assertSucceeds(setDoc(doc(db(masterCtx()), 'finanzas', 'master-test'), { monto: 999 }));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAYLOADS DEL AUDIT — verificación de invariantes nuevas
// ══════════════════════════════════════════════════════════════════════════
describe('audit: isValidReserva.hasOnly', () => {
  const base = {
    eventoId: 'evt-1',
    uidTitular: 'socio-uid',
    dniTitular: '12345678A',
    nombreTitular: 'Jose Test',
    emailTitular: 'jose@test.es',
    numPersonas: 1,
    acompañantes: 0,
  };

  it('rechaza campos no permitidos en la reserva', async () => {
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...base, campoExtra: 'inyectado',
    }));
  });

  it('rechaza email mal formado', async () => {
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...base, emailTitular: 'no-es-email',
    }));
  });

  it('rechaza emailTitular sin TLD válido', async () => {
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...base, emailTitular: 'a@b.x',
    }));
  });

  it('acepta precioVerificado booleano y rechaza otros tipos', async () => {
    await assertSucceeds(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...base, precioVerificado: false,
    }));
    await assertFails(addDoc(collection(db(socioCtx()), 'reservas'), {
      ...base, precioVerificado: 'no',
    }));
  });
});

describe('audit: isValidPagoMensual', () => {
  const base = {
    socioId: '12345678A', mes: 5, anio: 2026, pagado: true,
  };

  it('rechaza mes fuera de [1, 12]', async () => {
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2026_13_test'), {
      ...base, mes: 13,
    }));
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2026_0_test'), {
      ...base, mes: 0,
    }));
  });

  it('rechaza anio fuera de [2024, 2100]', async () => {
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2020_5_test'), {
      ...base, anio: 2020,
    }));
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2101_5_test'), {
      ...base, anio: 2101,
    }));
  });

  it('rechaza pagado de tipo distinto a bool', async () => {
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2026_5_typeFail'), {
      ...base, pagado: 'sí',
    }));
  });

  it('rechaza campos no permitidos', async () => {
    await assertFails(setDoc(doc(db(adminCtx()), 'pagos_mensuales', '2026_5_extra'), {
      ...base, campoExtra: 'inyectado',
    }));
  });

  it('teacher puede crear pago válido', async () => {
    await assertSucceeds(setDoc(doc(db(teacherCtx()), 'pagos_mensuales', '2026_6_teach'), {
      socioId: '12345678A', mes: 6, anio: 2026, pagado: true,
    }));
  });
});

describe('audit: isValidNewsletter', () => {
  it('rechaza estado != pendiente_confirmacion', async () => {
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'hack-1'), {
      nombre: 'X', email: 'x@x.es', acepto_terminos: true,
      estado: 'activo',
    }));
  });

  it('rechaza acepto_terminos != true', async () => {
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'hack-2'), {
      nombre: 'X', email: 'x@x.es', acepto_terminos: false,
    }));
  });

  it('rechaza email sin TLD válido', async () => {
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'hack-3'), {
      nombre: 'X', email: 'a@b.x', acepto_terminos: true,
    }));
  });

  it('rechaza campos no permitidos', async () => {
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'hack-4'), {
      nombre: 'X', email: 'x@x.es', acepto_terminos: true, role: 'admin',
    }));
  });

  it('acepta alta correcta con estado pendiente_confirmacion', async () => {
    await assertSucceeds(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'ok-1'), {
      nombre: 'OK', email: 'ok@ok.es', acepto_terminos: true,
      estado: 'pendiente_confirmacion',
    }));
  });

  it('permite re-alta de un doc en baja sobreescribiendo a pendiente_confirmacion', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'newsletter_subscribers', 'baja@x.es'), {
        nombre: 'X', email: 'baja@x.es', acepto_terminos: true, estado: 'baja',
      });
    });
    await assertSucceeds(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'baja@x.es'), {
      nombre: 'X', email: 'baja@x.es', acepto_terminos: true,
      estado: 'pendiente_confirmacion',
    }));
  });

  it('NO permite cambiar el email en un update', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'newsletter_subscribers', 'alguien@x.es'), {
        nombre: 'X', email: 'alguien@x.es', acepto_terminos: true, estado: 'baja',
      });
    });
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'alguien@x.es'), {
      nombre: 'X', email: 'otro@x.es', acepto_terminos: true,
      estado: 'pendiente_confirmacion',
    }));
  });

  it('NO permite update sobre un doc en estado activo', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'newsletter_subscribers', 'activo@x.es'), {
        nombre: 'X', email: 'activo@x.es', acepto_terminos: true, estado: 'activo',
      });
    });
    await assertFails(setDoc(doc(db(anonCtx()), 'newsletter_subscribers', 'activo@x.es'), {
      nombre: 'X', email: 'activo@x.es', acepto_terminos: true,
      estado: 'pendiente_confirmacion',
    }));
  });
});

describe('audit: socios read case-insensitive email', () => {
  it('socio con email en mayúsculas en el documento puede leer su perfil', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'socios', '11111111A'), {
        uid: 'otro-uid', email: 'JOSE@TEST.ES', dni: '11111111A',
      });
    });
    await assertSucceeds(getDoc(doc(db(socioCtx()), 'socios', '11111111A')));
  });
});
