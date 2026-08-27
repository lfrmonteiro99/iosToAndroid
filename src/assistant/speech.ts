import * as Speech from 'expo-speech';
import { logger } from '../utils/logger';

const TAG = 'speech';

/**
 * Speak a string of text aloud via expo-speech.
 *
 * Wrapped so a TTS failure can never crash the calling screen: any error
 * thrown synchronously by `Speech.speak` is caught and logged. (In the real
 * expo-speech API `speak` fires-and-forgets; engine errors arrive via the
 * `onError` option callback, but a synchronous throw from the mock or the
 * native bridge is still possible and is handled here.)
 */
export function speak(text: string, language?: string): void {
  try {
    // The voice has to be told the language. expo-speech otherwise picks the
    // engine default, which reads a Portuguese reply with an English voice —
    // intelligible at best, and the assistant now answers in the phone's
    // language (see assistant/replies.ts).
    if (language) Speech.speak(text, { language });
    else Speech.speak(text);
  } catch (e) {
    logger.warn(TAG, 'speak failed', e);
  }
}

/**
 * Stop any in-progress or queued speech.
 *
 * `Speech.stop` returns a promise that can reject; both the synchronous throw
 * and an asynchronous rejection are caught and logged so the caller (and the
 * screen's unmount cleanup) can never be disrupted by a TTS failure.
 */
export function stopSpeaking(): void {
  try {
    void Speech.stop().catch((e: unknown) => logger.warn(TAG, 'stopSpeaking failed', e));
  } catch (e) {
    logger.warn(TAG, 'stopSpeaking failed', e);
  }
}
