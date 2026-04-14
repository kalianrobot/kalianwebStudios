import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface AppConfig {
  cuotaMensualSocio: number;
}

const CONFIG_DOC_PATH = 'configuracion/global';

export const getDefaultConfig = (): AppConfig => ({
  cuotaMensualSocio: 15
});

export const fetchConfig = async (): Promise<AppConfig> => {
  try {
    const docRef = doc(db, CONFIG_DOC_PATH);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as AppConfig;
    } else {
      const defaultConfig = getDefaultConfig();
      await setDoc(docRef, defaultConfig);
      return defaultConfig;
    }
  } catch (error) {
    console.error("Error fetching config:", error);
    return getDefaultConfig();
  }
};

export const updateConfig = async (newConfig: Partial<AppConfig>) => {
  try {
    const docRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(docRef, newConfig, { merge: true });
  } catch (error) {
    console.error("Error updating config:", error);
    throw error;
  }
};

export const subscribeToConfig = (callback: (config: AppConfig) => void) => {
  const docRef = doc(db, CONFIG_DOC_PATH);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as AppConfig);
    } else {
      callback(getDefaultConfig());
    }
  });
};
