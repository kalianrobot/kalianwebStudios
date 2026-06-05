export declare const validatePuertaAccess: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    token: string;
}>, unknown>;
export declare const sendWelcomeEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<unknown>, unknown>;
export declare const sendMembershipUpdateEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<unknown>, unknown>;
export declare const sendReservationConfirmation: import("firebase-functions/v2/https").CallableFunction<any, Promise<unknown>, unknown>;
export declare const gestionarReservaInvitado: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    reserva: {
        eventoTitulo: any;
        fechaActividad: any;
        acompanantes: number;
        numPersonas: number;
        asistentesIngresados: number;
        esCurso: boolean;
        maxAcompanantes: number;
        plazasLibres: number;
    };
    cancelada?: undefined;
} | {
    ok: boolean;
    cancelada: boolean;
    reserva?: undefined;
}>, unknown>;
export declare const brevoWebhook: import("firebase-functions/v2/https").HttpsFunction;
export declare const onNewsletterSubscriberDeleted: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot, {
    id: string;
}>>;
export declare const reconciliarNewsletterBrevo: import("firebase-functions/v2/scheduler").ScheduleFunction;
