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
  type: number;
  isRead: boolean;
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
