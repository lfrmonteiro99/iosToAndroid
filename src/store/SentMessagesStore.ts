import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeviceSms } from './DeviceStore';

/**
 * Local record of messages sent from this app. The SmsManager put the SMS on
 * the air but never wrote it to content://sms (only the default SMS app may
 * do that — see #929), so the provider read in DeviceStore never contains it.
 * This store fills that gap by persisting sent messages locally and merging
 * them into the messages list read from the provider.
 */

const STORAGE_KEY = '@iostoandroid/sent_messages';

// Keep at most this many local messages per conversation, newest first —
// otherwise a long-lived thread grows this list without bound.
export const MAX_PER_THREAD = 500;

// A provider row within this window of a local send, with the same
// normalized address and body, is treated as the same message (e.g. the app
// becomes the default SMS app later, or the user switches to it).
export const DEDUPE_WINDOW_MS = 60_000;

export type SentMessageStatus = 'sending' | 'sent' | 'failed';

export interface SentMessage {
  id: string;
  address: string;
  body: string;
  date: number;
  status: SentMessageStatus;
}

/**
 * Digit-only suffix match, same rule as `findContactByPhone` (utils/contacts.ts):
 * last 10 digits for numbers with 10+ digits, exact digits otherwise. Used here
 * so "+1 555-123-4567" and "5551234567" merge/dedupe as the same conversation.
 */
export function normalizeAddress(address: string): string {
  const digits = address.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function formatSentDate(date: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${months[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}

let localIdSeq = 0;

/** Prefixed so it can never collide with a provider `_ID` (a bare numeric string). */
function nextLocalId(date: number): string {
  localIdSeq += 1;
  return `local:${date}:${localIdSeq}`;
}

export async function loadSentMessages(): Promise<SentMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSentMessages(messages: SentMessage[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages)).catch(() => {});
}

/** Keep at most `maxPerThread` messages per normalized address, newest first. */
export function pruneByThread(messages: SentMessage[], maxPerThread: number = MAX_PER_THREAD): SentMessage[] {
  const byThread = new Map<string, SentMessage[]>();
  for (const m of messages) {
    const key = normalizeAddress(m.address);
    const list = byThread.get(key);
    if (list) list.push(m);
    else byThread.set(key, [m]);
  }
  const result: SentMessage[] = [];
  for (const list of byThread.values()) {
    const sorted = [...list].sort((a, b) => b.date - a.date);
    result.push(...sorted.slice(0, maxPerThread));
  }
  return result;
}

/**
 * Persist a newly sent message and return it. `date` defaults to now but is
 * injectable so callers (and tests) can control ordering deterministically.
 */
export async function addSentMessage(address: string, body: string, date: number = Date.now()): Promise<SentMessage> {
  const existing = await loadSentMessages();
  const message: SentMessage = {
    id: nextLocalId(date),
    address,
    body,
    date,
    status: 'sent',
  };
  const pruned = pruneByThread([message, ...existing]);
  await saveSentMessages(pruned);
  return message;
}

export function sentMessageToDeviceSms(m: SentMessage): DeviceSms {
  return {
    id: m.id,
    address: m.address,
    body: m.body,
    date: m.date,
    dateFormatted: formatSentDate(m.date),
    type: 2, // sent
    isRead: true,
  };
}

/**
 * Merge locally-sent messages into the provider's list, dropping any local
 * message that already has a matching provider row (same normalized address,
 * same body, within DEDUPE_WINDOW_MS) — see #929 AC: no duplicate once the
 * provider does carry the message (default-SMS-app switch, or a future #926
 * step). Result is sorted newest-first by `date`.
 */
export function mergeSentWithProvider(sent: SentMessage[], provider: DeviceSms[]): DeviceSms[] {
  const deduped = sent.filter((local) => {
    const localKey = normalizeAddress(local.address);
    return !provider.some((p) => {
      const pDate = p.date ?? 0;
      return normalizeAddress(p.address) === localKey
        && p.body === local.body
        && Math.abs(pDate - local.date) <= DEDUPE_WINDOW_MS;
    });
  });
  return [...deduped.map(sentMessageToDeviceSms), ...provider].sort(
    (a, b) => (b.date ?? 0) - (a.date ?? 0),
  );
}
