/**
 * Pure voice/text command parser for the Siri voice assistant.
 *
 * Turns a free-text command string (e.g. "Call Alice", "liga à Sofia") into a
 * structured, typed intent. No React, no React Native, no native module, no
 * store imports — deterministic and unit-testable in isolation.
 *
 * Portuguese as well as English, because the assistant is spoken to: the
 * recognizer transcribes in the phone's language, and a parser that only knew
 * English verbs sent every Portuguese utterance to UNRECOGNIZED — which the
 * screen answered with "That's not supported yet.". That, not a missing
 * feature, is what "não consigo falar com ela" was.
 *
 * Matching is accent- and case-insensitive (`fold`), so "à", "a" and "Á" are
 * the same character to a pattern, while the CAPTURED text keeps its accents —
 * an app called "Câmara" and a contact called "Inês" have to survive the match
 * to be looked up.
 */

export type AssistantCommand =
  | { type: 'OPEN_APP'; appName: string }
  | { type: 'CALL_CONTACT'; contactName: string }
  | { type: 'SEND_MESSAGE'; contactName: string }
  | { type: 'WHAT_TIME' }
  | { type: 'SET_ALARM'; hour: number; minute: number }
  | { type: 'UNRECOGNIZED'; raw: string };

/**
 * Lower-case and strip accents, for MATCHING only.
 *
 * Decomposing and dropping the combining marks keeps one code unit per
 * character for the Latin accents a Portuguese recognizer emits, so an index
 * into the folded string is also an index into the original — which is how a
 * captured app or contact name keeps its accents (see `sliceOriginal`).
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * The tail of `original` that corresponds to a capture taken from `folded`.
 *
 * Falls back to the folded capture if folding changed the length (a ligature,
 * an emoji): a name without its accents still looks up better than nothing.
 */
function sliceOriginal(original: string, folded: string, capture: string): string {
  if (original.length !== folded.length) return capture.trim();
  const at = folded.length - capture.length;
  return original.slice(at).trim();
}

/**
 * "Open X" / "abre o X". The Portuguese "liga" only counts as *open* when the
 * word "app" follows it, because "liga ao João" is a phone call.
 */
const OPEN_RE =
  /^(?:open|launch|abre|abrir|abra|abre-me|ligar? (?:a )?app)\s+(?:the\s+|o\s+|a\s+|os\s+|as\s+|ao\s+|meu\s+|minha\s+)?(.+)$/;

/** "Call X" / "liga ao X" / "telefona à X" / "chama o X". */
const CALL_RE =
  /^(?:call|phone|ligar?|telefonar?|chamar?)(?:\s+(?:para\s+o|para\s+a|para|ao|a|o))?\s+(.+)$/;

/** "Send a message to X" / "manda (uma) mensagem ao X" / "escreve à X". */
const MESSAGE_RE =
  /^(?:send\s+(?:a\s+)?(?:message|text|sms)\s+to|(?:mandar?|enviar?|escrever?)\s+(?:uma\s+)?(?:mensagem|sms)(?:\s+(?:para\s+o|para\s+a|para|ao|a|o))?)\s+(.+)$/;

/** "What time is it" and the Portuguese ways of asking the same thing. */
const TIME_RE =
  /^(?:what(?:'s| is)?\s+(?:the\s+)?time(?:\s+is\s+it)?|what\s+time\s+is\s+it|que\s+horas\s+(?:sao|e|temos)|sabes\s+que\s+horas\s+sao|diz(?:-me)?\s+(?:as\s+)?horas)$/;

/** "Set an alarm for X" / "põe um alarme para as X" / "acorda-me às X". */
const ALARM_RE =
  /^(?:set\s+(?:an?\s+)?alarm\s+(?:for\s+)?|(?:poe|por|pon|defin(?:e|ir)|marcar?|criar?|agendar?)\s+(?:um\s+)?(?:alarme|despertador)\s*(?:para\s+)?(?:as\s+|ao\s+|a\s+|o\s+|pelas\s+)?|acorda-me\s+(?:as\s+|pelas\s+)?)(.+)$/;

/** Parse a raw voice/text command into a structured intent. */
export function parseCommand(input: string): AssistantCommand {
  const raw = input;
  const trimmed = input.trim();

  // Whitespace-only or empty input is unrecognized (raw keeps the original text).
  if (trimmed.length === 0) {
    return { type: 'UNRECOGNIZED', raw };
  }

  let text = trimmed;

  // Strip a leading "Hey Siri" / "Siri" / "ó Siri" wake phrase and any
  // following separator.
  const wake = /^(?:hey\s+siri|(?:o|ó)\s+siri|siri)[\s,:.!?]*/i.exec(text);
  if (wake) {
    text = text.slice(wake[0].length).trim();
  }
  if (text.length === 0) {
    return { type: 'UNRECOGNIZED', raw };
  }

  // Drop trailing sentence punctuation (but never a meaningful colon).
  text = text.replace(/[.!?]+$/, '');

  const folded = fold(text);

  const open = OPEN_RE.exec(folded);
  if (open) {
    const appName = sliceOriginal(text, folded, open[1]);
    if (appName.length > 0) {
      return { type: 'OPEN_APP', appName };
    }
  }

  const call = CALL_RE.exec(folded);
  if (call) {
    const contactName = sliceOriginal(text, folded, call[1]);
    if (contactName.length > 0) {
      return { type: 'CALL_CONTACT', contactName };
    }
  }

  const message = MESSAGE_RE.exec(folded);
  if (message) {
    const contactName = sliceOriginal(text, folded, message[1]);
    if (contactName.length > 0) {
      return { type: 'SEND_MESSAGE', contactName };
    }
  }

  if (TIME_RE.test(folded)) {
    return { type: 'WHAT_TIME' };
  }

  const alarm = ALARM_RE.exec(folded);
  if (alarm) {
    const parsed = parseTime(alarm[1].trim());
    if (parsed) {
      return { type: 'SET_ALARM', hour: parsed.hour, minute: parsed.minute };
    }
  }

  return { type: 'UNRECOGNIZED', raw };
}

/**
 * Parse a time expression into a 0–23 hour / 0–59 minute integer pair.
 *
 * Accepts 24-hour ("19:30"), 12-hour ("7pm", "7:30 pm", "12 am") and the
 * Portuguese spoken forms a recognizer actually produces: "7h", "7h30",
 * "7 da manhã", "7 e meia", "meio-dia", "meia-noite". Text reaching here is
 * already accent-folded by `parseCommand`.
 *
 * Returns null when no valid time is present or a value is out of range, so
 * the caller can fall back to UNRECOGNIZED.
 */
function parseTime(value: string): { hour: number; minute: number } | null {
  const time = value.trim();
  if (time.length === 0) {
    return null;
  }

  // "meio-dia" / "meia-noite" — the two named times, and the only ones with no
  // digits at all.
  if (/^meio[\s-]?dia$/.test(time)) return { hour: 12, minute: 0 };
  if (/^meia[\s-]?noite$/.test(time)) return { hour: 0, minute: 0 };

  // "7 e meia" → 7:30. Half past is the one fraction said out loud.
  const half = /^(\d{1,2})\s*e\s*meia(?:\s+da\s+(manha|tarde|noite))?$/.exec(time);
  if (half) {
    return normalizeSpokenHour(Number(half[1]), 30, half[2]);
  }

  // "7h", "7h30", "19h30" — the written-out Portuguese clock.
  const hFormat = /^(\d{1,2})\s*h(?:\s*(\d{2}))?(?:\s+da\s+(manha|tarde|noite))?$/.exec(time);
  if (hFormat) {
    return normalizeSpokenHour(Number(hFormat[1]), hFormat[2] ? Number(hFormat[2]) : 0, hFormat[3]);
  }

  // "7 da tarde", "7:30 da manha" — the period, rather than am/pm.
  const period = /^(\d{1,2})(?::(\d{2}))?\s+da\s+(manha|tarde|noite)$/.exec(time);
  if (period) {
    return normalizeSpokenHour(Number(period[1]), period[2] ? Number(period[2]) : 0, period[3]);
  }

  // A bare hour: "põe um alarme para as 8", "set alarm for 8". Taken as given,
  // so 8 is 08:00 and 19 is 19:00 — the 24-hour reading, which is how the time
  // is written in the locale this app is used in.
  //
  // It IS ambiguous: someone saying "as 8" at night may mean 20:00. Choosing
  // the 12-hour reading would be just as much of a guess in the other
  // direction, and the alarm's confirmation says the hour back ("Alarme
  // definido para as 08:00"), so a wrong guess is visible immediately rather
  // than at the hour it fails to ring.
  const bareHour = /^(\d{1,2})$/.exec(time);
  if (bareHour) {
    return normalizeSpokenHour(Number(bareHour[1]), 0, undefined);
  }

  let match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time);
  let hourStr: string;
  let minuteStr: string | undefined;
  let meridian: string | undefined;

  if (match) {
    hourStr = match[1];
    minuteStr = match[2];
    meridian = match[3]?.toLowerCase();
  } else {
    match = /^(\d{1,2})\s*(am|pm)$/i.exec(time);
    if (!match) {
      return null;
    }
    hourStr = match[1];
    minuteStr = undefined;
    meridian = match[2].toLowerCase();
  }

  const hour = Number(hourStr);
  const minute = minuteStr !== undefined ? Number(minuteStr) : 0;

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  let normalizedHour = hour;
  if (meridian === 'pm') {
    if (normalizedHour < 12) {
      normalizedHour += 12;
    }
  } else if (meridian === 'am') {
    if (normalizedHour === 12) {
      normalizedHour = 0;
    }
  }

  if (normalizedHour < 0 || normalizedHour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour: normalizedHour, minute };
}

/**
 * Apply a Portuguese period-of-day to a spoken hour.
 *
 * "manhã" leaves the hour as said (and 12 becomes 0); "tarde" and "noite" push
 * an hour below 12 into the afternoon/evening. Without a period the hour is
 * taken as given, so "põe um alarme para as 19h30" still means 19:30.
 */
function normalizeSpokenHour(
  hour: number,
  minute: number,
  period?: string,
): { hour: number; minute: number } | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  let h = hour;
  if (period === 'manha') {
    if (h === 12) h = 0;
  } else if (period === 'tarde' || period === 'noite') {
    if (h < 12) h += 12;
  }
  if (h < 0 || h > 23 || minute < 0 || minute > 59) return null;
  return { hour: h, minute };
}
