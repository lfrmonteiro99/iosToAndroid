/**
 * What the assistant says, per language.
 *
 * Kept out of the screen so the strings are testable without mounting it, and
 * so a new language means one entry here instead of edits across the screen.
 */
import type { AssistantLocale } from './locale';

export interface AssistantStrings {
  greeting: string;
  listening: string;
  inputPlaceholder: string;
  back: string;
  /**
   * The reply for a request that parsed to nothing.
   *
   * It names what the assistant CAN do. "That's not supported yet." told the
   * user only that they had failed, with no way to find out what would work —
   * and it is the reply almost every spoken request got.
   */
  notSupported: string;
  opening: (name: string) => string;
  appNotFound: (name: string) => string;
  openFailed: (name: string) => string;
  calling: (name: string) => string;
  contactNotFound: (name: string) => string;
  messaging: (name: string) => string;
  timeIs: (time: string) => string;
  alarmSet: (time: string) => string;
  alarmFailed: string;
  didNotHear: (error: string) => string;
  voiceUnavailableTitle: string;
  voiceUnavailableBody: string;
  voiceUnavailableNow: string;
  micNeededTitle: string;
  micDeniedBody: string;
  micBlockedBody: string;
  openSettings: string;
  ok: string;
}

const EN: AssistantStrings = {
  greeting: 'What can I help you with?',
  listening: 'Listening…',
  inputPlaceholder: 'Type a request',
  back: 'Back',
  notSupported:
    "I can't do that yet. I can open apps, call or message a contact, tell you "
    + 'the time, and set an alarm.',
  opening: (name) => `Opening ${name}.`,
  appNotFound: (name) => `Couldn't find an app called "${name}".`,
  openFailed: (name) => `Couldn't open ${name}.`,
  calling: (name) => `Calling ${name}.`,
  contactNotFound: (name) => `Couldn't find a contact called "${name}".`,
  messaging: (name) => `Messaging ${name}.`,
  timeIs: (time) => `It's ${time}`,
  alarmSet: (time) => `Alarm set for ${time}`,
  alarmFailed: "Couldn't set that alarm.",
  didNotHear: (error) => `Couldn't hear you (${error}).`,
  voiceUnavailableTitle: 'Voice Not Available',
  voiceUnavailableBody: 'Speech recognition is not available on this device.',
  voiceUnavailableNow: 'Voice input is unavailable right now.',
  micNeededTitle: 'Microphone Needed',
  micDeniedBody: 'Microphone access was denied. Voice commands need it to work.',
  micBlockedBody:
    'Microphone access is disabled. Enable it in system settings to talk to the assistant.',
  openSettings: 'Open Settings',
  ok: 'OK',
};

const PT: AssistantStrings = {
  greeting: 'Em que posso ajudar?',
  listening: 'A ouvir…',
  inputPlaceholder: 'Escreve um pedido',
  back: 'Voltar',
  notSupported:
    'Isso ainda não sei fazer. Sei abrir apps, ligar ou mandar mensagem a um '
    + 'contacto, dizer as horas e pôr um alarme.',
  opening: (name) => `A abrir ${name}.`,
  appNotFound: (name) => `Não encontrei nenhuma app chamada "${name}".`,
  openFailed: (name) => `Não consegui abrir ${name}.`,
  calling: (name) => `A ligar a ${name}.`,
  contactNotFound: (name) => `Não encontrei nenhum contacto chamado "${name}".`,
  messaging: (name) => `A escrever a ${name}.`,
  timeIs: (time) => `São ${time}`,
  alarmSet: (time) => `Alarme definido para as ${time}`,
  alarmFailed: 'Não consegui definir esse alarme.',
  didNotHear: (error) => `Não te ouvi (${error}).`,
  voiceUnavailableTitle: 'Voz Indisponível',
  voiceUnavailableBody: 'O reconhecimento de voz não está disponível neste dispositivo.',
  voiceUnavailableNow: 'A entrada por voz está indisponível neste momento.',
  micNeededTitle: 'Microfone Necessário',
  micDeniedBody: 'O acesso ao microfone foi negado. Os comandos de voz precisam dele.',
  micBlockedBody:
    'O acesso ao microfone está desactivado. Activa-o nas definições do sistema para '
    + 'falares com o assistente.',
  openSettings: 'Abrir Definições',
  ok: 'OK',
};

const TABLE: Record<AssistantLocale, AssistantStrings> = { en: EN, pt: PT };

export function assistantStrings(locale: AssistantLocale): AssistantStrings {
  return TABLE[locale] ?? EN;
}
