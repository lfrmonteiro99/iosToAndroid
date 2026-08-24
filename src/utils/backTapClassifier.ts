/**
 * Back-tap detection classifier (issue #636, native back-tap sensor service).
 *
 * This is the PURE, testable core of the algorithm. The Kotlin side
 * (modules/launcher-module/android/.../TapClassifier.kt + TapSensorService.kt)
 * runs the same math on the accelerometer/gyroscope thread and emits a
 * `onBackTap` event; this module is its JS twin so the logic is covered by
 * jest instead of only by an on-device manual test.
 *
 * A "back tap" is two or three sharp accelerometric impulses in quick
 * succession (iOS 14+ Back Tap). Manufacturers differ in sensitivity and in
 * how the fused sensor reports the impulse, so the two window thresholds are
 * configurable:
 *   - doubleWindowMs: gap allowed between two taps for a DOUBLE.
 *   - tripleWindowMs: span allowed across three taps for a TRIPLE.
 * Defaults match a mid-sensitivity profile; the Kotlin service passes the
 * user's chosen profile through so the JS and native windows never diverge.
 *
 * The window an impulse must fall inside is measured against the LATEST tap,
 * not the first — so a long pause followed by a quick burst still counts, and
 * a stale leading tap is pruned rather than poisoning the judgment.
 */

export type BackTapType = 'double' | 'triple';

export interface BackTapOptions {
  doubleWindowMs: number;
  tripleWindowMs: number;
}

export const DEFAULT_BACKTAP_OPTIONS: BackTapOptions = {
  doubleWindowMs: 300,
  tripleWindowMs: 600,
};

export interface BackTapClassification {
  type: BackTapType;
  count: number;
  /** The contributing tap timestamps, capped to the last 3 for a triple. */
  taps: number[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Judge a list of raw tap timestamps.
 *
 * Returns null when there is no recognizable multi-tap:
 *   - fewer than 2 taps survive,
 *   - any timestamp is non-finite (corrupt/hostile sensor frame),
 *   - the surviving taps do not fit within the configured windows.
 *
 * A TRIPLE (3 taps within tripleWindowMs of each other) wins over a DOUBLE on
 * the same burst — it is the more specific gesture. More than 3 taps collapse
 * to the last 3 ("quadruple back tap" is not a thing iOS exposes).
 */
export function classifyTaps(
  timestamps: number[],
  options: Partial<BackTapOptions> = {},
): BackTapClassification | null {
  if (!Array.isArray(timestamps)) return null;

  const doubleWindowMs = options.doubleWindowMs ?? DEFAULT_BACKTAP_OPTIONS.doubleWindowMs;
  const tripleWindowMs = options.tripleWindowMs ?? DEFAULT_BACKTAP_OPTIONS.tripleWindowMs;

  // Drop any non-finite frame up front — a single corrupt timestamp must not
  // silently produce a false negative we then act on.
  if (!timestamps.every(isFiniteNumber)) return null;

  // Work on an ascending copy so pruning and "last N" selection are stable
  // regardless of the order the caller recorded them.
  const sorted = [...timestamps].sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1];

  // Keep only taps inside the (wider) triple window of the latest — older
  // impulses cannot belong to the current gesture.
  const pruned = sorted.filter((t) => latest - t <= tripleWindowMs);

  if (pruned.length >= 3) {
    const last3 = pruned.slice(-3);
    // Because pruning kept only taps within tripleWindowMs of `latest`, the
    // last three always fit; this branch fires whenever 3+ taps survive.
    return { type: 'triple', count: last3.length, taps: last3 };
  }

  if (pruned.length >= 2) {
    const last2 = pruned.slice(-2);
    if (last2[1] - last2[0] <= doubleWindowMs) {
      return { type: 'double', count: last2.length, taps: last2 };
    }
  }

  return null;
}

/**
 * Incremental classifier mirroring how the native service reports impulses one
 * at a time. Push each detected impulse timestamp; it returns a classification
 * the moment a double or triple completes, or null while the gesture is still
 * ambiguous / stale.
 *
 * Non-increasing timestamps (a stuck sensor repeating a value, or frames
 * arriving out of order across the bridge) are ignored — they are never a real
 * second tap, and feeding them through would manufacture false doubles.
 */
export class TapClassifier {
  private taps: number[] = [];
  private readonly doubleWindowMs: number;
  private readonly tripleWindowMs: number;

  constructor(options: Partial<BackTapOptions> = {}) {
    this.doubleWindowMs = options.doubleWindowMs ?? DEFAULT_BACKTAP_OPTIONS.doubleWindowMs;
    this.tripleWindowMs = options.tripleWindowMs ?? DEFAULT_BACKTAP_OPTIONS.tripleWindowMs;
  }

  push(timestamp: number): BackTapClassification | null {
    if (!isFiniteNumber(timestamp)) return null;
    if (this.taps.length > 0 && timestamp <= this.taps[this.taps.length - 1]) {
      return null;
    }

    this.taps.push(timestamp);
    const latest = timestamp;
    this.taps = this.taps.filter((t) => latest - t <= this.tripleWindowMs);

    return classifyTaps(this.taps, {
      doubleWindowMs: this.doubleWindowMs,
      tripleWindowMs: this.tripleWindowMs,
    });
  }

  reset(): void {
    this.taps = [];
  }
}
