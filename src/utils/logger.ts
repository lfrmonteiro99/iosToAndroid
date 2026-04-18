const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  warn(tag: string, message: string, error?: unknown): void {
    if (isDev) {
      console.warn(`[${tag}] ${message}`, error ?? '');
    }
  },
  error(tag: string, message: string, error?: unknown): void {
    if (isDev) {
      console.error(`[${tag}] ${message}`, error ?? '');
    }
    // In production, errors could be sent to a crash reporting service here.
  },
  debug(tag: string, message: string): void {
    if (isDev) {
      console.log(`[${tag}] ${message}`);
    }
  },
};
