import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

const PROJECT_ID = 'demo-kalian';
const MASTER_EMAIL = 'kalianrobot@gmail.com';

let testEnv: RulesTestEnvironment;

// ─── helpers ───────────────────────────────────────────────────────────────
const masterCtx  = () => testEnv.authenticatedContext('master-uid',  { email: MASTER_EMAIL });
const adminCtx   = () => testEnv.authenticatedContext('admin-uid',   { email: 'admin@kalian.es' });
const teacherCtx = () => testEnv.authenticatedContext('teacher-uid', { email: 'teacher@kalian.es' });
const socioCtx   = () => testEnv.authenticatedContext('socio-uid',   { email: 'jose@test.es' });
const anonCtx    = () => testEnv.unauthenticatedContext();

const st = (ctx: ReturnType<typeof adminCtx>) => ctx.storage();

const imageData  = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
const binaryData = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // EXE magic bytes

const imageBlob  = new Blob([imageData],  { type: 'image/png' });
const binaryBlob = new Blob([binaryData], { type: 'application/octet-stream' });

// ─── setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
    firestore: {
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Seed Firestore roles so isAdmin() / isTeacherOf() can resolve
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'admin-uid'),   { role: 'admin' });
    await setDoc(doc(db, 'users', 'teacher-uid'), { role: 'teacher' });
    await setDoc(doc(db, 'users', 'socio-uid'),   { role: 'socio' });
    await setDoc(doc(db, 'cursos', 'cur-1'), {
      titulo: 'Curso Test',
      profesorId: 'teacher-uid',
      fechaFin: '2099-12-31',
      alumnos: ['12345678A'],
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC IMAGE COLLECTIONS (config, eventos, academias, profesores, exposiciones, locales)
// ══════════════════════════════════════════════════════════════════════════
const publicImagePaths = [
  { path: 'config/logo.png',          maxMB: 10 },
  { path: 'eventos/poster.jpg',       maxMB: 10 },
  { path: 'academias/foto.png',       maxMB: 5  },
  { path: 'profesores/perfil.jpg',    maxMB: 5  },
  { path: 'exposiciones/obra.png',    maxMB: 10 },
  { path: 'locales/sala.jpg',         maxMB: 5  },
];

for (const { path } of publicImagePaths) {
  const col = path.split('/')[0];

  describe(`storage/${col}`, () => {
    it('anónimo puede leer', async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await uploadBytes(ref(ctx.storage(), path), imageBlob);
      });
      await assertSucceeds(getDownloadURL(ref(st(anonCtx()), path)));
    });

    it('admin puede subir imagen válida', async () => {
      await assertSucceeds(uploadBytes(ref(st(adminCtx()), path), imageBlob));
    });

    it('anónimo NO puede subir', async () => {
      await assertFails(uploadBytes(ref(st(anonCtx()), path), imageBlob));
    });

    it('socio NO puede subir', async () => {
      await assertFails(uploadBytes(ref(st(socioCtx()), path), imageBlob));
    });

    it('admin NO puede subir archivo no-imagen (exe)', async () => {
      await assertFails(uploadBytes(ref(st(adminCtx()), path), binaryBlob));
    });

    it('admin puede borrar', async () => {
      // ensure file exists first
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await uploadBytes(ref(ctx.storage(), path), imageBlob);
      });
      await assertSucceeds(deleteObject(ref(st(adminCtx()), path)));
    });

    it('socio NO puede borrar', async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await uploadBytes(ref(ctx.storage(), path), imageBlob);
      });
      await assertFails(deleteObject(ref(st(socioCtx()), path)));
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// CURSOS (materiales de curso — PDF, vídeo, etc.)
// ══════════════════════════════════════════════════════════════════════════
describe('storage/cursos', () => {
  const filePath = 'cursos/cur-1/apuntes.pdf';
  const pdfBlob  = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

  it('teacher de ese curso puede subir material', async () => {
    await assertSucceeds(uploadBytes(ref(st(teacherCtx()), filePath), pdfBlob));
  });

  it('socio miembro puede leer materiales del curso', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await uploadBytes(ref(ctx.storage(), filePath), pdfBlob);
    });
    await assertSucceeds(getDownloadURL(ref(st(socioCtx()), filePath)));
  });

  it('anónimo NO puede leer materiales', async () => {
    await assertFails(getDownloadURL(ref(st(anonCtx()), filePath)));
  });

  it('socio NO puede subir materiales', async () => {
    await assertFails(uploadBytes(ref(st(socioCtx()), filePath), pdfBlob));
  });

  it('admin puede subir material', async () => {
    await assertSucceeds(uploadBytes(ref(st(adminCtx()), filePath), pdfBlob));
  });

  it('teacher puede borrar material de su curso', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await uploadBytes(ref(ctx.storage(), filePath), pdfBlob);
    });
    await assertSucceeds(deleteObject(ref(st(teacherCtx()), filePath)));
  });

  it('socio NO puede borrar material', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await uploadBytes(ref(ctx.storage(), filePath), pdfBlob);
    });
    await assertFails(deleteObject(ref(st(socioCtx()), filePath)));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// MASTER ADMIN — acceso total
// ══════════════════════════════════════════════════════════════════════════
describe('storage/master admin', () => {
  it('puede subir imagen en cualquier colección', async () => {
    await assertSucceeds(uploadBytes(ref(st(masterCtx()), 'config/master-test.png'), imageBlob));
    await assertSucceeds(uploadBytes(ref(st(masterCtx()), 'eventos/master-test.jpg'), imageBlob));
  });
});
