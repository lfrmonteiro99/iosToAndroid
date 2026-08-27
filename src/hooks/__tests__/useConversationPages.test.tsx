/**
 * #926 — the conversation list pages from the threads table.
 *
 * The rules that matter on a device are the ones that decide whether the user
 * sees every conversation: an unusable query must fall back rather than blank
 * the screen, a page must not be re-requested or duplicated, and the cursor
 * must keep moving.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import LauncherModule from '../../../modules/launcher-module/src';
import { useConversationPages, CONVERSATIONS_PAGE_SIZE } from '../useConversationPages';

const mod = LauncherModule as unknown as {
  getConversations: jest.Mock;
};

/** A thread row as the native side returns it. */
function thread(id: number, date: number) {
  return {
    threadId: String(id),
    date,
    dateFormatted: 'Jan 1, 09:00',
    messageCount: 3,
    snippet: `snippet ${id}`,
    isRead: true,
    addresses: [`+3519111111${id}`],
    address: `+3519111111${id}`,
  };
}

/** A full page, newest first, ending at `oldest`. */
function fullPage(startId: number, newest: number) {
  return Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) =>
    thread(startId + i, newest - i * 1000),
  );
}

beforeEach(() => {
  mod.getConversations.mockReset();
  mod.getConversations.mockResolvedValue([]);
});

describe('useConversationPages', () => {
  it('does not query when the permission is denied, or off Android', async () => {
    renderHook(() => useConversationPages(false));
    await waitFor(() => expect(mod.getConversations).not.toHaveBeenCalled());
  });

  it('asks for the newest page with a null cursor', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(mod.getConversations).toHaveBeenCalledWith(CONVERSATIONS_PAGE_SIZE, null);
    expect(result.current.rows?.[0].threadId).toBe('1');
  });

  it('keeps rows null when the threads query answers nothing, so the caller can fall back', async () => {
    mod.getConversations.mockResolvedValue([]);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(mod.getConversations).toHaveBeenCalled());
    expect(result.current.rows).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps rows null when the query throws — an OEM without a threads table', async () => {
    mod.getConversations.mockRejectedValue(new Error('no such table: threads'));
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(mod.getConversations).toHaveBeenCalled());
    expect(result.current.rows).toBeNull();
  });

  it('reports no more pages when the first page comes back short', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000), thread(2, 4000)]);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.hasMore).toBe(false);
  });

  it('reports more pages when the first page is full', async () => {
    mod.getConversations.mockResolvedValue(fullPage(1, 900_000));
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });

  it('appends the next page using the oldest held date as the cursor', async () => {
    mod.getConversations.mockResolvedValueOnce(fullPage(1, 900_000));
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    const oldest = 900_000 - (CONVERSATIONS_PAGE_SIZE - 1) * 1000;
    mod.getConversations.mockResolvedValueOnce([thread(99, oldest - 1000)]);
    await act(async () => { result.current.loadMore(); });

    expect(mod.getConversations).toHaveBeenLastCalledWith(CONVERSATIONS_PAGE_SIZE, oldest);
    expect(result.current.rows).toHaveLength(CONVERSATIONS_PAGE_SIZE + 1);
    expect(result.current.hasMore).toBe(false);
  });

  it('drops a re-delivered thread instead of listing it twice', async () => {
    mod.getConversations.mockResolvedValueOnce(fullPage(1, 900_000));
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    const oldest = 900_000 - (CONVERSATIONS_PAGE_SIZE - 1) * 1000;
    // A keyset boundary landing on a shared millisecond re-delivers the last
    // row of the previous page.
    mod.getConversations.mockResolvedValueOnce([thread(CONVERSATIONS_PAGE_SIZE, oldest), thread(99, oldest - 5)]);
    await act(async () => { result.current.loadMore(); });

    const ids = result.current.rows?.map((r) => r.threadId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.current.rows).toHaveLength(CONVERSATIONS_PAGE_SIZE + 1);
  });

  it('stops paging when a full page adds nothing new, instead of re-requesting it forever', async () => {
    const page = fullPage(1, 900_000);
    mod.getConversations.mockResolvedValueOnce(page);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // Every row shares the boundary date, so the cursor cannot move past them.
    mod.getConversations.mockResolvedValueOnce(page);
    await act(async () => { result.current.loadMore(); });

    expect(result.current.hasMore).toBe(false);
    expect(result.current.rows).toHaveLength(CONVERSATIONS_PAGE_SIZE);
  });

  it('ignores loadMore when there is no next page', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    mod.getConversations.mockClear();

    await act(async () => { result.current.loadMore(); });
    expect(mod.getConversations).not.toHaveBeenCalled();
  });

  it('serves one page request at a time, so a double onEndReached fetches once', async () => {
    mod.getConversations.mockResolvedValueOnce(fullPage(1, 900_000));
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    mod.getConversations.mockClear();
    mod.getConversations.mockResolvedValue([thread(99, 1000)]);

    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(mod.getConversations).toHaveBeenCalledTimes(1);
  });

  it('reload starts over from the newest page', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    mod.getConversations.mockResolvedValue([thread(2, 6000), thread(1, 5000)]);
    await act(async () => { result.current.reload(); });

    expect(mod.getConversations).toHaveBeenLastCalledWith(CONVERSATIONS_PAGE_SIZE, null);
    expect(result.current.rows?.map((r) => r.threadId)).toEqual(['2', '1']);
  });

  it('tries while the permission is still unknown — a device that granted it last run', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    const { result } = renderHook(() => useConversationPages(null));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it('re-fetches when the permission is confirmed after an empty attempt', async () => {
    mod.getConversations.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean | null }) => useConversationPages(enabled),
      { initialProps: { enabled: null as boolean | null } },
    );
    await waitFor(() => expect(mod.getConversations).toHaveBeenCalledTimes(1));

    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    await act(async () => { rerender({ enabled: true }); });

    expect(result.current.rows).toHaveLength(1);
  });

  it('does not re-run the same query when the permission is confirmed after a page arrived', async () => {
    mod.getConversations.mockResolvedValue([thread(1, 5000)]);
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean | null }) => useConversationPages(enabled),
      { initialProps: { enabled: null as boolean | null } },
    );
    await waitFor(() => expect(mod.getConversations).toHaveBeenCalledTimes(1));

    await act(async () => { rerender({ enabled: true }); });

    expect(mod.getConversations).toHaveBeenCalledTimes(1);
  });

  it('drops a page that resolves after a reload started', async () => {
    let resolveStale: (v: unknown) => void = () => {};
    mod.getConversations.mockImplementationOnce(
      () => new Promise((res) => { resolveStale = res; }),
    );
    const { result } = renderHook(() => useConversationPages(true));
    await waitFor(() => expect(mod.getConversations).toHaveBeenCalledTimes(1));

    mod.getConversations.mockResolvedValue([thread(2, 6000)]);
    await act(async () => { result.current.reload(); });
    await act(async () => { resolveStale([thread(1, 5000)]); });

    expect(result.current.rows?.map((r) => r.threadId)).toEqual(['2']);
  });
});
