// Stub — se implementará con grammY en Fase 0
// Por ahora define la interfaz del gateway

export interface TelegramMessage {
  userId: number;
  chatId: number;
  text?: string;
  voiceFileId?: string;
}

export function startTelegramBot(token: string, allowedUsers: number[]): void {
  console.log(`Bot Telegram arrancado (${allowedUsers.length} usuarios autorizados)`);
  console.log('Esperando mensajes...');

  // TODO: inicializar grammY Bot con token
  // TODO: middleware de whitelist con allowedUsers
  // TODO: handler de texto → orchestrator.handleMessage()
  // TODO: handler de voz → stt.transcribe() → orchestrator.handleMessage()

  void token; // usado al inicializar grammY
}
