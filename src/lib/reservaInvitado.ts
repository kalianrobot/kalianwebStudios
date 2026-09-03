import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const sendReservationConfirmation = (data: {
  email: string; nombre: string; eventoTitulo: string;
  ticketID: string; qrUrl: string; manageToken: string;
  fechaActividad?: string;
}) => httpsCallable(functions, 'sendReservationConfirmation')(data);

export type ResumenReserva = {
  eventoTitulo: string;
  fechaActividad: string;
  acompanantes: number;
  numPersonas: number;
  asistentesIngresados: number;
  esCurso: boolean;
  maxAcompanantes: number;
  plazasLibres: number;
};

type RespuestaGestion = {
  ok: boolean;
  reserva?: ResumenReserva;
  cancelada?: boolean;
};

const callable = httpsCallable<
  { manageToken: string; accion: 'consultar' | 'cancelar' | 'editar'; nuevoAcompanantes?: number },
  RespuestaGestion
>(functions, 'gestionarReservaInvitado');

/**
 * Genera un token de gestión criptográficamente seguro para una reserva.
 * 18 bytes aleatorios → ~28 caracteres en base36. No predecible (a diferencia
 * del ticketID, que usa Math.random y solo sirve como identificador visible).
 */
export const generarManageToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 28);

export const consultarReserva = (manageToken: string) =>
  callable({ manageToken, accion: 'consultar' }).then(r => r.data);

export const cancelarReservaInvitado = (manageToken: string) =>
  callable({ manageToken, accion: 'cancelar' }).then(r => r.data);

export const editarAcompanantesInvitado = (manageToken: string, nuevoAcompanantes: number) =>
  callable({ manageToken, accion: 'editar', nuevoAcompanantes }).then(r => r.data);

const callCalcularPrecio = httpsCallable<
  { eventoId: string; esCurso: boolean; numAcompañantes: number; dniTitular?: string; cupon?: string },
  { total: number; esSocio: boolean; esClave: boolean; socioVigente: boolean }
>(functions, 'calcularPrecioReserva');

export const calcularPrecioReserva = (params: {
  eventoId: string;
  esCurso: boolean;
  numAcompañantes: number;
  dniTitular?: string;
  cupon?: string;
}) => callCalcularPrecio(params).then(r => r.data);

const callComprobarDuplicada = httpsCallable<
  { eventoId: string; dni?: string; email?: string },
  { duplicada: boolean }
>(functions, 'comprobarReservaDuplicada');

/**
 * Comprueba server-side si ya existe una reserva para el evento con el mismo
 * uid/DNI/email. Necesario porque `firestore.rules` no permite a un invitado
 * anónimo hacer `list` sobre `reservas` (sólo admin/portero/titular autenticado
 * pueden leerlas), así que esta consulta no se puede hacer desde el cliente.
 */
export const comprobarReservaDuplicada = (params: {
  eventoId: string;
  dni?: string;
  email?: string;
}) => callComprobarDuplicada(params).then(r => r.data);
