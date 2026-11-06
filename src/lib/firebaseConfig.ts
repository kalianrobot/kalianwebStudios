import appletConfig from "../../firebase-applet-config.json";

type Env = Record<string, string | boolean | undefined>;

/**
 * Configuración de Firebase del cliente según el entorno de build.
 *
 * Los workflows de test/preview inyectan `VITE_FIREBASE_*` del proyecto de test;
 * si no vienen (dev local sin `.env.local`), se usa `firebase-applet-config.json`,
 * que apunta a producción. Antes el cliente ignoraba las variables y la web de
 * test leía y escribía en la base de datos de producción.
 */
export function resolverFirebaseConfig(env: Env) {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (typeof projectId !== 'string' || projectId.length === 0) return appletConfig;
  const str = (k: string) => (typeof env[k] === 'string' && env[k] ? (env[k] as string) : undefined);
  return {
    apiKey: str('VITE_FIREBASE_API_KEY'),
    authDomain: str('VITE_FIREBASE_AUTH_DOMAIN') || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: str('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: str('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: str('VITE_FIREBASE_APP_ID'),
    measurementId: str('VITE_FIREBASE_MEASUREMENT_ID'),
    firestoreDatabaseId: '(default)',
  };
}

export const firebaseConfig = resolverFirebaseConfig(import.meta.env as Env);
