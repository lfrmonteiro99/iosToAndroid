/**
 * A crash and breadcrumb log that survives into a release build.
 *
 * Why this exists: a device report of "opening a third-party app breaks the
 * launcher" could not be diagnosed at all. `logger` is a no-op unless __DEV__,
 * so a release build leaves no trace of a caught error; and an uncaught JS
 * error in release takes the process down with nothing written anywhere. The
 * only evidence available was a screenshot of Android's "keeps stopping".
 *
 * Two mechanisms, because they fail differently:
 *
 *  - BREADCRUMBS are written as the app runs, so they are already persisted
 *    when the process dies. They survive a NATIVE crash, which no JS handler
 *    can catch. That asymmetry is the point: a breadcrumb that says
 *    "launchApp:native-enter" with no matching "native-exit" localises a native
 *    crash to one call, which is otherwise only visible over adb.
 *
 *  - The FATAL record is written from ErrorUtils' global handler. It carries a
 *    JS stack, which breadcrumbs do not, but the write races the process
 *    teardown and can be lost.
 *
 * Storage is AsyncStorage rather than a file: it is already a dependency, and
 * the volume here is a few kilobytes that a user never sees unless they open
 * Diagnostics.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/diagnostics';

/** Kept small on purpose: this is read by a human, and it is written on a hot path. */
export const MAX_BREADCRUMBS = 40;

export type DiagnosticLevel = 'debug' | 'warn' | 'error' | 'fatal';

export interface Breadcrumb {
  at: string;
  level: DiagnosticLevel;
  tag: string;
  message: string;
  /** Stringified error or extra context, when there is one. */
  detail?: string;
}

export interface Diagnostics {
  breadcrumbs: Breadcrumb[];
  /** The last uncaught JS error, if one was captured before the process died. */
  lastFatal?: Breadcrumb & { stack?: string };
}

let state: Diagnostics = { breadcrumbs: [] };
let loaded = false;

/**
 * Turns anything thrown into one line plus, when available, a stack.
 *
 * Deliberately tolerant: this runs while handling a failure, so it must not be
 * able to fail itself — a getter that throws on a proxy, a circular object, a
 * thrown string are all things that reach here.
 */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error == null) return { message: '' };
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack };
  }
  try {
    return { message: typeof error === 'string' ? error : JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Fire-and-forget: a persistence failure must never mask the thing being logged. */
function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

/**
 * Records one breadcrumb. Safe to call from anywhere, including from inside an
 * error handler, and never throws.
 */
export function recordBreadcrumb(
  level: DiagnosticLevel,
  tag: string,
  message: string,
  detail?: unknown,
): void {
  try {
    const described = detail === undefined ? undefined : describeError(detail);
    state.breadcrumbs.push({
      at: new Date().toISOString(),
      level,
      tag,
      message,
      ...(described?.message ? { detail: described.message } : {}),
    });
    // Trim from the front: the newest entries are the ones that explain a crash.
    if (state.breadcrumbs.length > MAX_BREADCRUMBS) {
      state.breadcrumbs = state.breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
    persist();
  } catch {
    // Diagnostics must never be the reason something breaks.
  }
}

/** Records an uncaught error, keeping its stack, and drops a breadcrumb too. */
export function recordFatal(error: unknown, isFatal: boolean): void {
  try {
    const { message, stack } = describeError(error);
    const entry: Breadcrumb & { stack?: string } = {
      at: new Date().toISOString(),
      level: 'fatal',
      tag: isFatal ? 'fatal' : 'uncaught',
      message,
      ...(stack ? { stack } : {}),
    };
    state.lastFatal = entry;
    state.breadcrumbs.push({ at: entry.at, level: 'fatal', tag: entry.tag, message });
    if (state.breadcrumbs.length > MAX_BREADCRUMBS) {
      state.breadcrumbs = state.breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
    persist();
  } catch {
    // As above.
  }
}

/**
 * Hooks RN's global error handler, delegating to whatever was installed before
 * (the redbox in dev, the default crash path in release) so behaviour is
 * unchanged apart from the record being written.
 *
 * Idempotent: a second call is a no-op, so a re-render or a fast refresh cannot
 * chain handlers.
 */
let installed = false;
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;

  // ErrorUtils is a React Native global, not part of the DOM or Node typings.
  const errorUtils = (
    globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => ((e: unknown, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
      };
    }
  ).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    recordFatal(error, isFatal === true);
    previous?.(error, isFatal);
  });
}

/** Reads what was persisted, including from the run that crashed. */
export async function readDiagnostics(): Promise<Diagnostics> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { breadcrumbs: [] };
    const parsed = JSON.parse(raw) as Diagnostics;
    // A truncated or hand-edited blob must not break the screen that shows it.
    return {
      breadcrumbs: Array.isArray(parsed?.breadcrumbs) ? parsed.breadcrumbs : [],
      ...(parsed?.lastFatal ? { lastFatal: parsed.lastFatal } : {}),
    };
  } catch {
    return { breadcrumbs: [] };
  }
}

export async function clearDiagnostics(): Promise<void> {
  state = { breadcrumbs: [] };
  loaded = false;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the in-memory state is already cleared.
  }
}

/**
 * Carries the previous run's breadcrumbs forward so the log spanning a crash is
 * one list rather than two, and so the entries that explain a crash are not
 * dropped by the first write after the restart.
 */
export async function hydrateDiagnostics(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const previous = await readDiagnostics();
  state = {
    breadcrumbs: [...previous.breadcrumbs, ...state.breadcrumbs].slice(-MAX_BREADCRUMBS),
    ...(previous.lastFatal ? { lastFatal: previous.lastFatal } : {}),
  };
}

/** Test seam: the in-memory state, without a storage round-trip. */
export function peekDiagnostics(): Diagnostics {
  return { breadcrumbs: [...state.breadcrumbs], ...(state.lastFatal ? { lastFatal: state.lastFatal } : {}) };
}

/** Test seam: forget everything, including the installed-handler latch. */
export function resetDiagnosticsForTest(): void {
  state = { breadcrumbs: [] };
  loaded = false;
  installed = false;
}
