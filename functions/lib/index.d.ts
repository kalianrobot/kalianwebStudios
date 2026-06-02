export declare const sendWelcomeEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<unknown>, unknown>;
export declare const sendMembershipUpdateEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<unknown>, unknown>;
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
