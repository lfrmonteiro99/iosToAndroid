import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IncomingNotification } from './notificationAppRules';

/**
 * Buffer motor for the Scheduled Summary feature (issue #868, part of #630 /
 * #838). Apps whose delivery policy is 'scheduled' or 'digest' are routed by
 * `routeNotification` to `reason: 'batched'` — this module is where those
 * notifications actually land instead of being silently dropped by
 * `notificationCallbackForFocus`.
 *
 * `captureBatched` takes no slot: the split between the 'morning' and
 * 'evening' summary only happens at release time (the scheduler issue that
 * depends on this one decides which slot is due). All captured notifications
 * share one FIFO buffer.
 */

export const BATCHED_SUMMARY_STORAGE_KEY = '@iostoandroid/batched_summary_v1';

// Same cap as seenIds in notificationFocusFilter.ts — bounds memory/storage
// growth if the summary is never released (e.g. Scheduled Summary disabled).
const MAX_BUFFER_SIZE = 200;

interface StoredBatchedNotification extends IncomingNotification {
  capturedAt: number;
}

let buffer: StoredBatchedNotification[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function normalizeStored(raw: unknown): StoredBatchedNotification[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredBatchedNotification[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.length === 0) continue;
    out.push({
      id: e.id,
      title: typeof e.title === 'string' ? e.title : undefined,
      text: typeof e.text === 'string' ? e.text : undefined,
      packageName: typeof e.packageName === 'string' ? e.packageName : undefined,
      capturedAt: typeof e.capturedAt === 'number' ? e.capturedAt : 0,
    });
  }
  return out;
}

async function persist(): Promise<void> {
  // A capture/release before hydration has settled must not overwrite
  // whatever is already on disk with an incomplete in-memory view — merge
  // first so the write reflects the full history, not just this process run.
  if (!hydrated) await hydrateBatchedSummaryBuffer();
  try {
    await AsyncStorage.setItem(BATCHED_SUMMARY_STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // Best-effort: the in-memory buffer remains correct for this process run
    // even if the write fails; the next successful capture retries the write.
  }
}

/**
 * Loads any notifications persisted before a process restart/kill into the
 * in-memory buffer. Call once at app startup, before the notification
 * listener attaches. Idempotent: a second call is a no-op once the first has
 * settled (or reuses the in-flight promise while it's still loading).
 */
export async function hydrateBatchedSummaryBuffer(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const json = await AsyncStorage.getItem(BATCHED_SUMMARY_STORAGE_KEY);
      if (json !== null) {
        const stored = normalizeStored(JSON.parse(json));
        buffer = [...stored, ...buffer];
      }
    } catch {
      // Corrupted storage: keep whatever is already in-memory for this run.
    } finally {
      hydrated = true;
    }
  })();
  return hydratePromise;
}

/** Stacks a notification onto the global buffer (no slot at capture time). */
export function captureBatched(n: IncomingNotification): void {
  if (!n || !n.id) return;
  buffer.push({
    id: n.id,
    title: n.title,
    text: n.text,
    packageName: n.packageName,
    capturedAt: Date.now(),
  });
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
  }
  void persist();
}

/** Reads the buffer, returns its entries, and empties it. */
export function releaseBatched(_slot: 'morning' | 'evening'): IncomingNotification[] {
  const released: IncomingNotification[] = buffer.map(({ id, title, text, packageName }) => ({
    id,
    title,
    text,
    packageName,
  }));
  buffer = [];
  void persist();
  return released;
}

/**
 * Test-only: clears the in-memory buffer and hydration state without
 * touching AsyncStorage — models a process restart (module state gone,
 * disk untouched) without needing `jest.resetModules()` + `require()`.
 */
export function __resetScheduledSummaryBufferForTests(): void {
  buffer = [];
  hydrated = false;
  hydratePromise = null;
}
