import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

export const sendWelcomeEmail = async (email: string, nombre: string, activationLink: string) => {
  const fn = httpsCallable(functions, 'sendWelcomeEmail');
  await fn({ email, nombre, activationLink });
};

export const sendMembershipUpdateEmail = async (email: string, nombre: string, uid: string, membresias: Record<string, string>) => {
  const fn = httpsCallable(functions, 'sendMembershipUpdateEmail');
  await fn({ email, nombre, uid, membresias });
};
