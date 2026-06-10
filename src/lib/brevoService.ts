import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * Wrappers de Cloud Functions callable para emails Brevo. Toda la lógica de
 * llamada a la API de Brevo y el manejo de la API key viven en el servidor
 * (`functions/src/index.ts`). El cliente solo invoca el callable y no tiene
 * acceso a `BREVO_API_KEY`.
 */

const callWelcome = httpsCallable<
  { email: string; nombre: string; activationLink: string },
  unknown
>(functions, 'sendWelcomeEmail');

const callMembership = httpsCallable<
  { email: string; nombre: string; uid: string; membresias: Record<string, string> },
  unknown
>(functions, 'sendMembershipUpdateEmail');

const callSubscribeNewsletter = httpsCallable<
  { nombre: string; email: string },
  { ok: boolean; duplicate?: boolean }
>(functions, 'subscribeNewsletter');

export const sendWelcomeEmail = async (email: string, nombre: string, activationLink: string) => {
  await callWelcome({ email, nombre, activationLink });
};

export const sendMembershipUpdateEmail = async (
  email: string,
  nombre: string,
  uid: string,
  membresias: Record<string, string>,
) => {
  await callMembership({ email, nombre, uid, membresias });
};

export const subscribeNewsletter = async (nombre: string, email: string) => {
  const res = await callSubscribeNewsletter({ nombre, email });
  return res.data;
};
