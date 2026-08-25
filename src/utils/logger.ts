import { recordBreadcrumb } from './crashLog';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Console in dev, and a persisted breadcrumb in every build.
 *
 * The second half is new and is the point. `logger.error` used to be a no-op
 * outside __DEV__ — the comment where the breadcrumb call now sits read "in
 * production, errors could be sent to a crash reporting service here" — so a
 * release build discarded every caught error. When a device reported that
 * opening a third-party app killed the launcher, there was nothing to read:
 * not the error, not even the fact that the code had got that far. See
 * crashLog.ts for why breadcrumbs and the fatal record fail differently.
 *
 * debug() stays dev-only: it is the level used inside loops and on render
 * paths, and persisting it would push the entries that matter out of the ring.
 */
export const logger = {
  warn(tag: string, message: string, error?: unknown): void {
    if (isDev) {
      console.warn(`[${tag}] ${message}`, error ?? '');
    }
    recordBreadcrumb('warn', tag, message, error);
  },
  error(tag: string, message: string, error?: unknown): void {
    if (isDev) {
      console.error(`[${tag}] ${message}`, error ?? '');
    }
    recordBreadcrumb('error', tag, message, error);
  },
  debug(tag: string, message: string): void {
    if (isDev) {
      console.log(`[${tag}] ${message}`);
    }
  },
  /**
   * A step marker, not a problem: recorded but never printed. Used to bracket
   * calls that can take the process down without throwing anything JS can see,
   * where the absence of the closing marker is the evidence.
   */
  trace(tag: string, message: string): void {
    recordBreadcrumb('debug', tag, message);
  },
};
