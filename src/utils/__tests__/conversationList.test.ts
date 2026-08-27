import {
  appendConversationPage,
  conversationToRow,
  conversationsToRows,
  oldestConversationDate,
} from '../conversationList';
import type { SmsConversation } from '../../../modules/launcher-module/src';

// #926 — the conversation list was built by taking the N newest messages of the
// whole provider and grouping them by address. That cannot enumerate threads at
// any N: one chatty thread buries every other, so a phone with a few hundred SMS
// showed only the conversations inside those N. Reported from a device as "it
// doesn't show all the device's messages".
//
// These are the rules for turning THREAD rows into list rows, and for paging
// them. Pure, so none of it needs the screen mounted.

function conv(over: Partial<SmsConversation> = {}): SmsConversation {
  return {
    threadId: '1',
    date: 1_700_000_000_000,
    messageCount: 3,
    snippet: 'hello',
    isRead: true,
    addresses: ['+351912345678'],
    address: '+351912345678',
    ...over,
  };
}

describe('conversationToRow', () => {
  it('uses the thread snippet as the preview', () => {
    expect(conversationToRow(conv({ snippet: 'see you then' })).lastMessage.body).toBe('see you then');
  });

  it('keys the row by THREAD, not by address', () => {
    // So a row keeps its identity across pages even when the participant is
    // stored in two formats — which is exactly what broke opening a
    // conversation (the nine-vs-ten digit mismatch).
    expect(conversationToRow(conv({ threadId: '42' })).lastMessage.id).toBe('thread-42');
  });

  it('reports one unread rather than inventing a count', () => {
    // The threads table carries a per-thread read flag, not a count. Making a
    // number up puts a wrong badge on the row.
    expect(conversationToRow(conv({ isRead: false })).unreadCount).toBe(1);
    expect(conversationToRow(conv({ isRead: true })).unreadCount).toBe(0);
  });

  it('carries only the preview in messages, not a history', () => {
    // The list renders the newest message only. Fetching each thread's history
    // to build the list is what made the old approach expensive as well as
    // wrong; ConversationScreen loads it per thread, already paged (#927).
    expect(conversationToRow(conv()).messages).toHaveLength(1);
  });

  it('survives a thread with no snippet', () => {
    expect(conversationToRow(conv({ snippet: '' })).lastMessage.body).toBe('');
  });
});

describe('conversationsToRows', () => {
  it('orders newest first', () => {
    const rows = conversationsToRows([
      conv({ threadId: '1', date: 1000 }),
      conv({ threadId: '2', date: 3000 }),
      conv({ threadId: '3', date: 2000 }),
    ]);
    expect(rows.map((r) => r.threadId)).toEqual(['2', '3', '1']);
  });

  it('drops a thread with no resolvable address', () => {
    // It cannot be opened (getMessagesForThread matches on address) and cannot
    // be replied to, so the row would be a dead end.
    const rows = conversationsToRows([conv({ threadId: '1' }), conv({ threadId: '2', address: '' })]);
    expect(rows.map((r) => r.threadId)).toEqual(['1']);
  });

  it('drops a whitespace-only address too', () => {
    expect(conversationsToRows([conv({ address: '   ' })])).toEqual([]);
  });

  it('handles an empty page', () => {
    expect(conversationsToRows([])).toEqual([]);
  });

  it('survives a null entry in the page', () => {
    // The bridge returns [] on failure, but a partially-readable provider can
    // hand back holes, and the list must not crash on one.
    const rows = conversationsToRows([conv(), null as unknown as SmsConversation]);
    expect(rows).toHaveLength(1);
  });
});

describe('appendConversationPage', () => {
  it('appends the next page', () => {
    const first = conversationsToRows([conv({ threadId: '1', date: 3000 })]);
    const second = conversationsToRows([conv({ threadId: '2', date: 2000 })]);
    expect(appendConversationPage(first, second).map((r) => r.threadId)).toEqual(['1', '2']);
  });

  it('drops a thread the list already holds', () => {
    // Not hypothetical: a keyset boundary landing on threads that share a
    // millisecond re-delivers them. That is the price of not using an offset,
    // and it is cheaper than an offset desyncing mid-scroll.
    const first = conversationsToRows([conv({ threadId: '1', date: 3000 })]);
    const repeat = conversationsToRows([conv({ threadId: '1', date: 3000 }), conv({ threadId: '2', date: 2000 })]);
    expect(appendConversationPage(first, repeat).map((r) => r.threadId)).toEqual(['1', '2']);
  });

  it('dedupes by thread, so a one-to-one and a group with the same person both stay', () => {
    // Deduping by address would swallow one of two genuinely different
    // conversations.
    const oneToOne = conversationsToRows([conv({ threadId: '1', address: '+351912345678' })]);
    const group = conversationsToRows([
      conv({ threadId: '9', address: '+351912345678', addresses: ['+351912345678', '+351999999999'] }),
    ]);
    expect(appendConversationPage(oneToOne, group)).toHaveLength(2);
  });

  it('an empty page changes nothing', () => {
    const first = conversationsToRows([conv({ threadId: '1' })]);
    expect(appendConversationPage(first, [])).toEqual(first);
  });
});

describe('oldestConversationDate', () => {
  it('is the cursor for the next page', () => {
    const rows = conversationsToRows([
      conv({ threadId: '1', date: 3000 }),
      conv({ threadId: '2', date: 1000 }),
    ]);
    expect(oldestConversationDate(rows)).toBe(1000);
  });

  it('is null for an empty list, which means "fetch the newest page"', () => {
    expect(oldestConversationDate([])).toBeNull();
  });
});
