import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * Wrappers de Cloud Functions callable para emails Brevo. Toda la lógica de
 * llamada a la API de Brevo y el manejo de la API key viven en el servidor
 * (`functions/src/index.ts`). El cliente solo invoca el callable y no tiene
 * acceso a `BREVO_API_KEY`.
 */

const callWelcome = httpsCallable<
  { email: string; nombre: string },
  unknown
>(functions, 'sendWelcomeEmail');

const callMembership = httpsCallable<
  { email: string; nombre: string; uid: string; membresias: Record<string, string> },
  unknown
>(functions, 'sendMembershipUpdateEmail');

const callCarnet = httpsCallable<
  Record<string, never>,
  { enviado: boolean; motivo?: string }
>(functions, 'enviarCarnetDigital');

const callCourseApproval = httpsCallable<
  { solicitudId: string },
  unknown
>(functions, 'sendCourseApprovalEmail');

const callSubscribeNewsletter = httpsCallable<
  { nombre: string; email: string },
  { ok: boolean; duplicate?: boolean }
>(functions, 'subscribeNewsletter');

const callPasswordReset = httpsCallable<
  { email: string },
  { ok: boolean }
>(functions, 'requestPasswordReset');

/**
 * Email de bienvenida. El enlace para crear la contraseña lo genera la Cloud
 * Function con `generatePasswordResetLink`; el cliente no lo construye ni lo ve.
 */
export const sendWelcomeEmail = async (email: string, nombre: string) => {
  await callWelcome({ email, nombre });
};

/**
 * Manda el carnet digital al socio autenticado si aún no lo tiene. Idempotente
 * server-side: la function marca `carnetEnviadoAt` y no reenvía.
 */
export const enviarCarnetDigital = async () => {
  const res = await callCarnet({});
  return res.data;
};

export const sendMembershipUpdateEmail = async (
  email: string,
  nombre: string,
  uid: string,
  membresias: Record<string, string>,
) => {
  await callMembership({ email, nombre, uid, membresias });
};

/**
 * Email de "solicitud de inscripción aceptada". Solo recibe el id de la
 * solicitud: la Cloud Function lee destinatario y datos del curso del doc
 * autoritativo en Firestore y exige que ya esté en estado 'aprobado'.
 */
export const sendCourseApprovalEmail = async (solicitudId: string) => {
  await callCourseApproval({ solicitudId });
};

export const subscribeNewsletter = async (nombre: string, email: string) => {
  const res = await callSubscribeNewsletter({ nombre, email });
  return res.data;
};

export const requestPasswordReset = async (email: string) => {
  await callPasswordReset({ email });
};
