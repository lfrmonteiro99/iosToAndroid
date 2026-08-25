import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordBreadcrumb,
  recordFatal,
  readDiagnostics,
  clearDiagnostics,
  hydrateDiagnostics,
  peekDiagnostics,
  resetDiagnosticsForTest,
  installCrashHandler,
  describeError,
  MAX_BREADCRUMBS,
} from '../crashLog';

// A device reported that opening a third-party app kills the launcher, and the
// investigation had nothing to work with: logger was a no-op outside __DEV__,
// so a release build discarded every caught error, and an uncaught error took
// the process down without writing anything. The only evidence was a photo of
// Android's "keeps stopping" dialog.
//
// What matters most here is the failure mode this is designed around: a NATIVE
// crash cannot be caught by any JS handler, so the record has to be written
// BEFORE the thing that might crash. That is what the breadcrumbs are, and it
// is why they are persisted on every append rather than at the end.

/** The in-memory store AsyncStorage is mocked with in this repo. */
function storedRaw(): string | null {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === '@iostoandroid/diagnostics',
  );
  return calls.length ? (calls[calls.length - 1][1] as string) : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDiagnosticsForTest();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

describe('breadcrumbs', () => {
  it('records what happened, with the tag and message', () => {
    recordBreadcrumb('warn', 'AppsStore', 'launchApp native enter com.example.app');
    const [crumb] = peekDiagnostics().breadcrumbs;
    expect(crumb.tag).toBe('AppsStore');
    expect(crumb.message).toBe('launchApp native enter com.example.app');
    expect(crumb.level).toBe('warn');
  });

  it('persists on every append, not at the end', () => {
    // The whole design. A breadcrumb only helps if it is already on disk when
    // the process dies, which is precisely the case a JS handler cannot cover.
    recordBreadcrumb('debug', 'A', 'one');
    expect(storedRaw()).toContain('one');
    recordBreadcrumb('debug', 'A', 'two');
    expect(storedRaw()).toContain('two');
  });

  it('keeps the NEWEST entries when the ring overflows', () => {
    // Dropping from the front, not the back: the last few lines before a crash
    // are the ones that explain it.
    for (let i = 0; i < MAX_BREADCRUMBS + 10; i++) recordBreadcrumb('debug', 'A', `m${i}`);
    const { breadcrumbs } = peekDiagnostics();
    expect(breadcrumbs).toHaveLength(MAX_BREADCRUMBS);
    expect(breadcrumbs[breadcrumbs.length - 1].message).toBe(`m${MAX_BREADCRUMBS + 9}`);
    expect(breadcrumbs.some((b) => b.message === 'm0')).toBe(false);
  });

  it('attaches a detail when given an error', () => {
    recordBreadcrumb('error', 'X', 'failed', new Error('binder died'));
    expect(peekDiagnostics().breadcrumbs[0].detail).toBe('Error: binder died');
  });

  it('omits the detail field entirely when there is nothing to say', () => {
    recordBreadcrumb('debug', 'X', 'plain');
    expect(peekDiagnostics().breadcrumbs[0].detail).toBeUndefined();
  });

  it('never throws, even when storage is broken', () => {
    // Diagnostics must not become a source of the failures it exists to record.
    (AsyncStorage.setItem as jest.Mock).mockImplementation(() => {
      throw new Error('storage full');
    });
    expect(() => recordBreadcrumb('warn', 'X', 'still fine')).not.toThrow();
  });
});

describe('describeError', () => {
  it('keeps an Error name, message and stack', () => {
    const described = describeError(new TypeError('bad'));
    expect(described.message).toBe('TypeError: bad');
    expect(described.stack).toBeTruthy();
  });

  it('handles a thrown string', () => {
    expect(describeError('just a string').message).toBe('just a string');
  });

  it('handles a thrown object', () => {
    expect(describeError({ code: 7 }).message).toBe('{"code":7}');
  });

  it('survives a circular object rather than throwing while handling a failure', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
  });

  it('treats null and undefined as nothing to describe', () => {
    expect(describeError(null).message).toBe('');
    expect(describeError(undefined).message).toBe('');
  });
});

describe('fatals', () => {
  it('keeps the stack, which breadcrumbs do not have', () => {
    recordFatal(new Error('boom'), true);
    expect(peekDiagnostics().lastFatal?.message).toBe('Error: boom');
    expect(peekDiagnostics().lastFatal?.stack).toBeTruthy();
  });

  it('also drops a breadcrumb, so the timeline shows where it happened', () => {
    recordBreadcrumb('debug', 'A', 'before');
    recordFatal(new Error('boom'), true);
    const { breadcrumbs } = peekDiagnostics();
    expect(breadcrumbs.map((b) => b.message)).toEqual(['before', 'Error: boom']);
  });

  it('distinguishes a fatal from a non-fatal uncaught error', () => {
    recordFatal(new Error('a'), true);
    expect(peekDiagnostics().lastFatal?.tag).toBe('fatal');
    recordFatal(new Error('b'), false);
    expect(peekDiagnostics().lastFatal?.tag).toBe('uncaught');
  });
});

describe('installCrashHandler', () => {
  type Handler = (e: unknown, isFatal?: boolean) => void;
  let previous: jest.Mock;
  let current: Handler | undefined;

  beforeEach(() => {
    previous = jest.fn();
    current = previous as unknown as Handler;
    (globalThis as unknown as { ErrorUtils: unknown }).ErrorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (h: Handler) => { current = h; },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it('records the error AND delegates to the handler that was already there', () => {
    // Delegation matters: the previous handler is the redbox in dev and the
    // default crash path in release. Swallowing it would change behaviour.
    installCrashHandler();
    const error = new Error('kaboom');
    current?.(error, true);

    expect(peekDiagnostics().lastFatal?.message).toBe('Error: kaboom');
    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it('is idempotent — a second call does not chain a second handler', () => {
    installCrashHandler();
    const afterFirst = current;
    installCrashHandler();
    expect(current).toBe(afterFirst);

    current?.(new Error('once'), true);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does nothing when ErrorUtils is absent instead of throwing', () => {
    delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
    expect(() => installCrashHandler()).not.toThrow();
  });
});

describe('reading it back', () => {
  it('returns what was persisted', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ breadcrumbs: [{ at: 'x', level: 'warn', tag: 'T', message: 'm' }] }),
    );
    const read = await readDiagnostics();
    expect(read.breadcrumbs).toHaveLength(1);
  });

  it('survives a truncated or hand-edited blob', async () => {
    // The screen that renders this must not be the thing that crashes.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"breadcrumbs": [{"at"');
    await expect(readDiagnostics()).resolves.toEqual({ breadcrumbs: [] });
  });

  it('survives a blob whose breadcrumbs are not an array', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"breadcrumbs": "nope"}');
    await expect(readDiagnostics()).resolves.toEqual({ breadcrumbs: [] });
  });

  it('returns empty when nothing was ever written', async () => {
    await expect(readDiagnostics()).resolves.toEqual({ breadcrumbs: [] });
  });

  it('carries the crashed run forward, so the log spans the restart', async () => {
    // Without this the first breadcrumb after a restart would be written over
    // the entries that explain why there was a restart.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        breadcrumbs: [{ at: 'x', level: 'debug', tag: 'T', message: 'before the crash' }],
        lastFatal: { at: 'x', level: 'fatal', tag: 'fatal', message: 'Error: died' },
      }),
    );
    recordBreadcrumb('debug', 'T', 'after the restart');
    await hydrateDiagnostics();

    const { breadcrumbs, lastFatal } = peekDiagnostics();
    expect(breadcrumbs.map((b) => b.message)).toEqual(['before the crash', 'after the restart']);
    expect(lastFatal?.message).toBe('Error: died');
  });

  it('hydrates once, so a re-render cannot duplicate the history', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ breadcrumbs: [{ at: 'x', level: 'debug', tag: 'T', message: 'one' }] }),
    );
    await hydrateDiagnostics();
    await hydrateDiagnostics();
    expect(peekDiagnostics().breadcrumbs).toHaveLength(1);
  });

  it('clears both the stored blob and what is in memory', async () => {
    recordBreadcrumb('warn', 'T', 'something');
    recordFatal(new Error('x'), true);
    await clearDiagnostics();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/diagnostics');
    expect(peekDiagnostics()).toEqual({ breadcrumbs: [] });
  });
});
