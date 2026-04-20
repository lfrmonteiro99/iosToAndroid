import { pushSample, sampledVelocity } from '../gestureVelocity';
import type { VelocitySample } from '../gestureVelocity';
import { gestureConfig } from '../gestureConfig';

const CLAMP = gestureConfig.velocityClampDpPerMs;
const WINDOW = gestureConfig.velocityWindowMs;

function makeBuf(): VelocitySample[] {
  return [];
}

describe('gestureVelocity', () => {
  describe('sampledVelocity', () => {
    it('returns zero for empty buffer', () => {
      const buf = makeBuf();
      expect(sampledVelocity(buf, 0)).toEqual({ vx: 0, vy: 0 });
    });

    it('returns zero for single sample', () => {
      const buf = makeBuf();
      pushSample(buf, 0, 0, 0);
      expect(sampledVelocity(buf, 0)).toEqual({ vx: 0, vy: 0 });
    });

    it('computes correct velocity for two samples 100dp apart, 50ms apart', () => {
      const buf = makeBuf();
      pushSample(buf, 0, 0, 0);
      pushSample(buf, 100, 0, 50);
      const { vx } = sampledVelocity(buf, 50);
      // 100 dp / 50 ms = 2.0 dp/ms
      expect(vx).toBeCloseTo(2.0, 5);
    });

    it('clamps velocity to +CLAMP', () => {
      const buf = makeBuf();
      pushSample(buf, 0, 0, 0);
      // 1000dp in 10ms = 100 dp/ms — well above 4.0
      pushSample(buf, 1000, 0, 10);
      const { vx } = sampledVelocity(buf, 10);
      expect(vx).toBe(CLAMP);
    });

    it('clamps velocity to -CLAMP', () => {
      const buf = makeBuf();
      pushSample(buf, 0, 0, 0);
      pushSample(buf, -1000, 0, 10);
      const { vx } = sampledVelocity(buf, 10);
      expect(vx).toBe(-CLAMP);
    });

    it('trims old samples: after pushing t=0..180 step 30, oldest retained t >= 60', () => {
      const buf = makeBuf();
      for (let t = 0; t <= 180; t += 30) {
        pushSample(buf, t, 0, t);
      }
      // 2*WINDOW = 120; cutoff from last push (t=180) is 180 - 120 = 60
      expect(buf[0].t).toBeGreaterThanOrEqual(60);
    });

    it('uses oldest sample within the WINDOW, not outside', () => {
      const buf = makeBuf();
      // t=0 is outside WINDOW relative to last sample t=100 (cutoff = 100-60=40)
      pushSample(buf, 0, 0, 0);
      // t=50 is within WINDOW (50 >= 40)
      pushSample(buf, 50, 0, 50);
      pushSample(buf, 100, 0, 100);

      // The oldest sample within window is t=50, not t=0
      // velocity should be (100-50)/(100-50) = 1.0 dp/ms, not (100-0)/100 = 1.0 — both happen to be 1.0
      // To distinguish, shift x so only t=0 would yield a different result
      const buf2 = makeBuf();
      pushSample(buf2, 0, 0, 0);    // far outside window — x=0
      pushSample(buf2, 200, 0, 50); // within window — x=200
      pushSample(buf2, 260, 0, 100);

      // oldest-in-window is t=50, x=200; velocity = (260-200)/(100-50) = 1.2
      // if t=0 were used: (260-0)/100 = 2.6
      const { vx } = sampledVelocity(buf2, 100);
      expect(vx).toBeCloseTo(1.2, 5);
    });
  });

  describe('pushSample', () => {
    it('trims samples older than 2*WINDOW from the head', () => {
      const buf = makeBuf();
      // push at t=0, well before the 2*WINDOW cutoff at t=180-120=60
      pushSample(buf, 0, 0, 0);
      pushSample(buf, 1, 0, 180);
      // t=0 is older than 180 - 2*60 = 60, so it should be trimmed
      expect(buf.findIndex(s => s.t === 0)).toBe(-1);
    });

    it('retains samples within 2*WINDOW', () => {
      const buf = makeBuf();
      pushSample(buf, 0, 0, 100);
      pushSample(buf, 1, 0, 200);
      // cutoff = 200 - 120 = 80; t=100 >= 80, retained
      expect(buf.findIndex(s => s.t === 100)).toBeGreaterThanOrEqual(0);
    });
  });
});
