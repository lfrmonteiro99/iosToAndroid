/**
 * Turning the provider's THREAD rows into the rows the conversation list
 * renders (#926).
 *
 * Why this exists: the list was built by taking the N newest messages of the
 * whole provider and grouping them by address. That cannot enumerate threads at
 * any N — one chatty thread buries every other, so a phone with a few hundred
 * SMS showed only the conversations that happened to fall inside those N.
 * Raising N moves the cliff without removing it.
 *
 * The threads table gives one row per conversation, with the snippet and the
 * date of its newest message. This maps those rows onto the shape the existing
 * row component already renders, so the list gains real pagination without the
 * row, the swipe actions or `groupConversations` changing at all.
 *
 * Pure and free of React so every rule below is testable without mounting the
 * screen.
 */
import type { SmsConversation } from '../../modules/launcher-module/src';

/** The subset of DeviceSms the conversation row reads. */
export interface ConversationPreview {
  id: string;
  address: string;
  body: string;
  date: number;
  dateFormatted: string;
  type: number;
  isRead: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `MMM d, HH:mm` — the shape the native message queries already emit, so a row
 * looks the same whichever source filled the list.
 *
 * Only used when the native side did not send `dateFormatted`, which happens
 * when a JS bundle runs against a native build older than that field. Without
 * this the row would render an empty date column.
 */
export function formatConversationDate(date: number): string {
  if (!Number.isFinite(date) || date <= 0) return '';
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}

export interface ConversationRowModel {
  address: string;
  messages: ConversationPreview[];
  lastMessage: ConversationPreview;
  unreadCount: number;
  /** Present only for rows that came from the threads table. */
  threadId?: string;
}

/**
 * One thread row → one list row.
 *
 * `messages` holds just the preview, not the thread's history: the list only
 * ever renders the newest message, and fetching each thread's messages to build
 * the list is what made the old approach expensive as well as wrong. The history
 * is loaded by ConversationScreen, per thread, already paged (#927).
 */
export function conversationToRow(conv: SmsConversation): ConversationRowModel {
  const preview: ConversationPreview = {
    // Keyed by thread, so a row keeps its identity across pages even if the
    // participant's address is stored in two formats.
    id: `thread-${conv.threadId}`,
    address: conv.address,
    body: conv.snippet ?? '',
    date: conv.date,
    dateFormatted: conv.dateFormatted || formatConversationDate(conv.date),
    // 1 = inbox. The threads table does not say who sent the newest message,
    // and the list does not show it — the preview is the snippet either way.
    type: 1,
    isRead: conv.isRead,
  };
  return {
    address: conv.address,
    messages: [preview],
    lastMessage: preview,
    // The threads table carries a per-thread read flag, not a count. One is the
    // honest answer for "this thread has something unread": inventing a number
    // would put a wrong badge on the row.
    unreadCount: conv.isRead ? 0 : 1,
    threadId: conv.threadId,
  };
}

/**
 * A page of thread rows, newest first, with the unusable ones dropped.
 *
 * A thread with no resolvable address is dropped rather than rendered: it cannot
 * be opened (getMessagesForThread matches on address) and cannot be replied to,
 * so a row for it is a dead end the user can only be confused by.
 */
export function conversationsToRows(convs: readonly SmsConversation[]): ConversationRowModel[] {
  return convs
    .filter((c) => c != null && typeof c.address === 'string' && c.address.trim().length > 0)
    .map(conversationToRow)
    .sort((a, b) => b.lastMessage.date - a.lastMessage.date);
}

/**
 * Appends the next page, dropping threads already held.
 *
 * Deduped by threadId, not by address: the same participant can legitimately
 * appear in a one-to-one thread and in a group thread, and those are different
 * conversations. Deduping by address would silently swallow one of them.
 *
 * A repeated page is not hypothetical — a keyset boundary landing on threads
 * that share a millisecond re-delivers them, which is the price of not using an
 * offset.
 */
export function appendConversationPage(
  existing: readonly ConversationRowModel[],
  page: readonly ConversationRowModel[],
): ConversationRowModel[] {
  const seen = new Set(existing.map((c) => c.threadId ?? c.address));
  const fresh = page.filter((c) => !seen.has(c.threadId ?? c.address));
  return [...existing, ...fresh];
}

/**
 * The keyset cursor for the next page: the oldest date currently held.
 *
 * Null for an empty list, which the caller reads as "fetch the newest page".
 */
export function oldestConversationDate(rows: readonly ConversationRowModel[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((min, r) => Math.min(min, r.lastMessage.date), Number.POSITIVE_INFINITY);
}

/**
 * Lends each thread row the message bodies the recent slice happens to hold, so
 * searching still matches on text and not only on the snippet.
 *
 * The list's identity, order and pagination come from the threads table, which
 * is complete. The bodies come from DeviceStore's recent-message slice, which is
 * not — but search over bodies was ALREADY limited to that slice before any of
 * this, so nothing gets worse and the list stops hiding conversations. Matching
 * the whole history would mean fetching every thread's messages to render a
 * list, which is the cost the thread query exists to avoid.
 *
 * `keyOf` is injected rather than imported so this file stays free of the phone
 * normalisation rules — those live in utils/contacts.ts, and having two copies
 * of them is what broke opening a conversation in the first place.
 */
export function withSearchBodies<M extends { address: string; body: string }>(
  rows: readonly ConversationRowModel[],
  recent: readonly M[],
  keyOf: (address: string) => string,
): ConversationRowModel[] {
  if (recent.length === 0) return [...rows];

  const bodiesByKey = new Map<string, string[]>();
  for (const m of recent) {
    if (!m || typeof m.address !== 'string') continue;
    const key = keyOf(m.address);
    if (!key) continue;
    const list = bodiesByKey.get(key);
    if (list) list.push(m.body ?? '');
    else bodiesByKey.set(key, [m.body ?? '']);
  }

  return rows.map((row) => {
    const bodies = bodiesByKey.get(keyOf(row.address));
    if (!bodies || bodies.length === 0) return row;
    // The snippet stays FIRST and stays `lastMessage`: it is what the row
    // renders, and it is the provider's own answer for the newest message.
    // These extra entries exist only for the search predicate to read.
    const extra = bodies
      .filter((body) => body !== row.lastMessage.body)
      .map((body, i) => ({ ...row.lastMessage, id: `${row.lastMessage.id}-s${i}`, body }));
    return extra.length === 0 ? row : { ...row, messages: [row.lastMessage, ...extra] };
  });
}
