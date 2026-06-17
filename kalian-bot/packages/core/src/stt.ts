// Speech-to-text via OpenAI Whisper API
// Stub — se implementará en Fase 0

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

export async function transcribeAudio(
  _audioBuffer: Buffer,
  _mimeType: string,
): Promise<TranscriptionResult> {
  // TODO: Enviar audio a OpenAI Whisper API
  // TODO: Borrar el buffer de audio después de transcribir (RGPD)

  return {
    text: 'Stub: transcripción no implementada aún',
    language: 'es',
    duration: 0,
  };
}
