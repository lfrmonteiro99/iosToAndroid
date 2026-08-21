/**
 * Pure voice/text command parser for the Siri voice assistant.
 *
 * Turns a free-text command string (e.g. "Call Alice") into a structured,
 * typed intent. No React, no React Native, no native module, no store imports —
 * deterministic and unit-testable in isolation. This is the first building block
 * toward replacing the `AssistiveTouch` "siri" placeholder (see #122).
 */

export type AssistantCommand =
  | { type: 'OPEN_APP'; appName: string }
  | { type: 'CALL_CONTACT'; contactName: string }
  | { type: 'SEND_MESSAGE'; contactName: string }
  | { type: 'WHAT_TIME' }
  | { type: 'SET_ALARM'; hour: number; minute: number }
  | { type: 'UNRECOGNIZED'; raw: string };

/** Parse a raw voice/text command into a structured intent. */
export function parseCommand(input: string): AssistantCommand {
  const raw = input;
  const trimmed = input.trim();

  // Whitespace-only or empty input is unrecognized (raw keeps the original text).
  if (trimmed.length === 0) {
    return { type: 'UNRECOGNIZED', raw };
  }

  let text = trimmed;

  // Strip a leading "Hey Siri" / "Siri" wake phrase and any following separator.
  const wake = /^(?:hey\s+siri|siri)[\s,:.!?]*/i.exec(text);
  if (wake) {
    text = text.slice(wake[0].length).trim();
  }
  if (text.length === 0) {
    return { type: 'UNRECOGNIZED', raw };
  }

  // Drop trailing sentence punctuation (but never a meaningful colon).
  text = text.replace(/[.!?]+$/, '');

  const lower = text.toLowerCase();

  // "Open [app]"
  const open = /^open\s+(.+)$/i.exec(text);
  if (open) {
    const appName = open[1].trim();
    if (appName.length > 0) {
      return { type: 'OPEN_APP', appName };
    }
  }

  // "Call [contact]"
  const call = /^call\s+(.+)$/i.exec(text);
  if (call) {
    const contactName = call[1].trim();
    if (contactName.length > 0) {
      return { type: 'CALL_CONTACT', contactName };
    }
  }

  // "Send [a] message to [contact]"
  const send = /^send\s+(?:a\s+)?message\s+to\s+(.+)$/i.exec(text);
  if (send) {
    const contactName = send[1].trim();
    if (contactName.length > 0) {
      return { type: 'SEND_MESSAGE', contactName };
    }
  }

  // "What time is it"
  if (/^what\s+time\s+is\s+it$/.test(lower)) {
    return { type: 'WHAT_TIME' };
  }

  // "Set alarm [for] [time]" — 12-hour (7pm / 7:30 pm) or 24-hour (19:30)
  const alarm = /^set\s+alarm\s+(?:for\s+)?(.+)$/i.exec(text);
  if (alarm) {
    const timeStr = alarm[1].trim();
    const parsed = parseTime(timeStr);
    if (parsed) {
      return { type: 'SET_ALARM', hour: parsed.hour, minute: parsed.minute };
    }
  }

  return { type: 'UNRECOGNIZED', raw };
}

/**
 * Parse a time expression into a 0–23 hour / 0–59 minute integer pair.
 * Accepts 24-hour ("19:30") and 12-hour ("7pm", "7:30 pm", "12 am") forms.
 * Returns null when no valid time is present or a value is out of range,
 * so the caller can fall back to UNRECOGNIZED.
 */
function parseTime(value: string): { hour: number; minute: number } | null {
  const time = value.trim();
  if (time.length === 0) {
    return null;
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
