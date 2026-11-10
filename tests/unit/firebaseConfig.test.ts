import { describe, it, expect } from 'vitest';
import { resolverFirebaseConfig } from '../../src/lib/firebaseConfig';
import appletConfig from '../../firebase-applet-config.json';

describe('resolverFirebaseConfig', () => {
  it('sin variables de entorno usa firebase-applet-config.json', () => {
    expect(resolverFirebaseConfig({})).toBe(appletConfig);
  });

  it('con VITE_FIREBASE_PROJECT_ID usa el proyecto de las variables (test/preview)', () => {
    const cfg = resolverFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_PROJECT_ID: 'kalian-test',
      VITE_FIREBASE_APP_ID: 'app',
    });
    expect(cfg.projectId).toBe('kalian-test');
    expect(cfg.apiKey).toBe('k');
    expect(cfg.authDomain).toBe('kalian-test.firebaseapp.com');
    expect(cfg.firestoreDatabaseId).toBe('(default)');
  });
});
