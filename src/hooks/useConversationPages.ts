/**
 * The conversation list, paged from the provider's THREADS table (#926).
 *
 * Why a hook and not a filter over DeviceStore.messages: that list is the N
 * newest messages of the whole provider, and grouping it by address cannot
 * enumerate conversations at any N — one chatty thread buries every other, so
 * a phone with a few hundred SMS showed only some of its conversations. The
 * threads table returns one row per conversation, so the list can be paged:
 * fetch a page, fetch the next when the user reaches the end.
 *
 * Paging is keyset (page by the thread's `date`, not by offset) so an SMS
 * arriving mid-scroll cannot shift a page boundary and duplicate or skip rows.
 *
 * `rows` is null until the first page resolves, and stays null when the query
 * is unusable (no native module, no permission, an OEM without a threads
 * table). The caller reads null as "use the old grouped list" — a device that
 * cannot answer this query must not end up with a blank Messages screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendConversationPage,
  conversationsToRows,
  oldestConversationDate,
  type ConversationRowModel,
} from '../utils/conversationList';

/**
 * One page. Big enough that a normal phone's list is one or two fetches, small
 * enough that the first screenful is not waiting on hundreds of canonical
 * address lookups (one query per recipient id, memoised per call).
 */
export const CONVERSATIONS_PAGE_SIZE = 30;

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    // Dynamic import is unavailable in some environments (e.g. Jest's VM);
    // fall back to a synchronous require so the module stays reachable there.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require; fallback for environments without dynamic import
      return require('../../modules/launcher-module/src').default;
    } catch {
      return null; // Expected: module unavailable on non-Android
    }
  }
};

export interface ConversationPagesResult {
  /** Null while unknown or unavailable — the caller then keeps its own source. */
  rows: ConversationRowModel[] | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/**
 * @param enabled Whether the SMS permission is known to be granted. Null means
 * "not known yet": the query is still attempted, because on a device that has
 * had the permission since a previous run the list should fill before the
 * permission check resolves. False (no permission, or not Android) skips it.
 * The raw tri-state is the effect's dependency, so being granted later
 * re-fetches the first page.
 */
export function useConversationPages(enabled: boolean | null): ConversationPagesResult {
  const [rows, setRows] = useState<ConversationRowModel[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Bumped per first-page request; a response whose id is stale is dropped
  // (the screen reloaded, or unmounted — the cleanup below sets -1, which no
  // request id can equal, so an in-flight response is dropped even when no
  // newer request follows).
  const requestIdRef = useRef(0);
  // A ref, not the isLoadingMore state: onEndReached can fire twice before
  // React re-renders, and both calls would read the same stale `false`.
  const isLoadingMoreRef = useRef(false);
  // onEndReached fires as soon as a short list mounts, which without this
  // would race the first page's own request and duplicate its rows.
  const firstPageDoneRef = useRef(false);
  const cursorRef = useRef<number | null>(null);
  // Whether a page has actually arrived. `enabled` going from unknown to
  // granted must re-fetch when the first attempt came back empty (the
  // permission was the reason), but re-fetching a list we already have would
  // just run the same provider query twice on every open.
  const hasRowsRef = useRef(false);

  useEffect(() => () => { requestIdRef.current = -1; }, []);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    firstPageDoneRef.current = false;
    cursorRef.current = null;
    try {
      const mod = await getLauncher();
      if (requestId !== requestIdRef.current) return;
      if (!mod?.getConversations) {
        setRows(null);
        setHasMore(false);
        return;
      }
      const page = await mod.getConversations(CONVERSATIONS_PAGE_SIZE, null);
      if (requestId !== requestIdRef.current) return;
      const pageRows = conversationsToRows(page ?? []);
      // An empty first page is not "no conversations": it is also what an OEM
      // without a threads table returns. Staying null keeps the old grouped
      // list rather than showing an empty screen on such a device.
      setRows(pageRows.length > 0 ? pageRows : null);
      hasRowsRef.current = pageRows.length > 0;
      setHasMore(pageRows.length > 0 && (page?.length ?? 0) === CONVERSATIONS_PAGE_SIZE);
      cursorRef.current = oldestConversationDate(pageRows);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setRows(null);
      hasRowsRef.current = false;
      setHasMore(false);
    } finally {
      if (requestId === requestIdRef.current) firstPageDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (enabled === false) return;
    if (enabled === true && hasRowsRef.current) return;
    loadFirstPage();
  }, [enabled, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMoreRef.current || !firstPageDoneRef.current) return;
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const mod = await getLauncher();
      if (!mod?.getConversations || requestId !== requestIdRef.current) return;
      const page = await mod.getConversations(CONVERSATIONS_PAGE_SIZE, cursorRef.current);
      if (requestId !== requestIdRef.current) return;
      const pageRows = conversationsToRows(page ?? []);
      let added = 0;
      setRows((prev) => {
        const merged = appendConversationPage(prev ?? [], pageRows);
        added = merged.length - (prev?.length ?? 0);
        return merged;
      });
      const nextCursor = oldestConversationDate(pageRows);
      // A full page that added nothing new means the cursor cannot move past a
      // group of threads sharing a millisecond. Stopping here is the only way
      // out: keeping hasMore true would re-request that same page on every
      // scroll to the end, forever.
      if ((page?.length ?? 0) < CONVERSATIONS_PAGE_SIZE || (added === 0 && nextCursor === cursorRef.current)) {
        setHasMore(false);
      }
      if (nextCursor != null) cursorRef.current = nextCursor;
    } catch {
      setHasMore(false);
    } finally {
      isLoadingMoreRef.current = false;
      if (requestId === requestIdRef.current) setIsLoadingMore(false);
    }
  }, [hasMore]);

  return { rows, hasMore, isLoadingMore, loadMore, reload: loadFirstPage };
}
