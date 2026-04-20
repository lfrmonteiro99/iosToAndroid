import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { gestureConfig } from './gestureConfig';

export interface VelocitySample {
  x: number;
  y: number;
  t: number;
}

const WINDOW = gestureConfig.velocityWindowMs;
const CLAMP = gestureConfig.velocityClampDpPerMs;

export function pushSample(buf: VelocitySample[], x: number, y: number, t: number): void {
  'worklet';
  buf.push({ x, y, t });
  while (buf.length > 0 && buf[0].t < t - 2 * WINDOW) {
    buf.shift();
  }
}

export function sampledVelocity(buf: VelocitySample[], now: number): { vx: number; vy: number } {
  'worklet';
  if (buf.length < 2) {
    return { vx: 0, vy: 0 };
  }

  const last = buf[buf.length - 1];
  const cutoff = last.t - WINDOW;

  let oldIdx = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].t >= cutoff) {
      oldIdx = i;
      break;
    }
    oldIdx = i + 1;
  }

  // Ensure we don't use the last sample as the old sample
  if (oldIdx >= buf.length - 1) {
    oldIdx = buf.length - 2;
  }

  const old = buf[oldIdx];
  const dt = last.t - old.t;

  if (dt === 0) {
    return { vx: 0, vy: 0 };
  }

  const rawVx = (last.x - old.x) / dt;
  const rawVy = (last.y - old.y) / dt;

  const vx = Math.max(-CLAMP, Math.min(CLAMP, rawVx));
  const vy = Math.max(-CLAMP, Math.min(CLAMP, rawVy));

  // suppress unused parameter warning — now is available for callers that
  // want to pass wall-clock time rather than last.t
  void now;

  return { vx, vy };
}

export function useVelocityBuffer(): SharedValue<VelocitySample[]> {
  return useSharedValue<VelocitySample[]>([]);
}
