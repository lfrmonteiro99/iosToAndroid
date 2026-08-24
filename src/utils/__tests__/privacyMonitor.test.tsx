import {
  sensorBreakdown,
  toPrivacySensorViews,
  totalAccessCount,
} from '../privacyMonitor';
import type { PrivacyReport, PrivacySensorSummary } from '../../../modules/launcher-module/src';

function makeSensor(overrides: Partial<PrivacySensorSummary> = {}): PrivacySensorSummary {
  return {
    sensor: 'camera',
    label: 'Camera',
    icon: 'camera',
    bg: '#1C1C1E',
    totalAccesses: 0,
    appCount: 0,
    topApps: [],
    ...overrides,
  };
}

describe('privacyMonitor', () => {
  // ── RED guard ───────────────────────────────────────────────────────────
  // These tests fail until privacyMonitor.ts exists/implements correctly.

  it('ranks per-app breakdown by count descending', () => {
    const sensor = makeSensor({
      topApps: [
        { packageName: 'com.whatsapp', appName: 'WhatsApp', count: 4 },
        { packageName: 'com.instagram', appName: 'Instagram', count: 12 },
        { packageName: 'com.maps', appName: 'Maps', count: 9 },
      ],
    });

    const rows = sensorBreakdown(sensor);
    expect(rows.map((r) => r.appName)).toEqual(['Instagram', 'Maps', 'WhatsApp']);
  });

  it('normalizes the largest app to ratio 1 and scales the rest', () => {
    const sensor = makeSensor({
      topApps: [
        { packageName: 'com.instagram', appName: 'Instagram', count: 12 },
        { packageName: 'com.whatsapp', appName: 'WhatsApp', count: 4 },
      ],
    });

    const rows = sensorBreakdown(sensor);
    expect(rows[0].ratio).toBe(1);
    expect(rows[1].ratio).toBeCloseTo(4 / 12, 5);
  });

  it('drops zero/negative counts instead of scaling them', () => {
    const sensor = makeSensor({
      topApps: [
        { packageName: 'com.a', appName: 'A', count: 0 },
        { packageName: 'com.b', appName: 'B', count: -3 },
        { packageName: 'com.c', appName: 'C', count: 5 },
      ],
    });

    const rows = sensorBreakdown(sensor);
    expect(rows).toHaveLength(1);
    expect(rows[0].packageName).toBe('com.c');
    expect(rows[0].ratio).toBe(1);
  });

  it('reports no accesses and empty breakdown for a sensor with no apps', () => {
    const view = toPrivacySensorViews({
      generatedAt: 1,
      sensors: [makeSensor({ topApps: [] })],
    })[0];

    expect(view.hasAccesses).toBe(false);
    expect(view.breakdown).toEqual([]);
  });

  it('flags a sensor with accesses via hasAccesses', () => {
    const view = toPrivacySensorViews({
      generatedAt: 1,
      sensors: [makeSensor({ topApps: [{ packageName: 'com.c', appName: 'C', count: 2 }] })],
    })[0];

    expect(view.hasAccesses).toBe(true);
    expect(view.breakdown).toHaveLength(1);
  });

  it('sums total accesses across sensors, ignoring non-finite values', () => {
    const report: PrivacyReport = {
      generatedAt: 1,
      sensors: [
        makeSensor({ sensor: 'camera', totalAccesses: 12 }),
        makeSensor({ sensor: 'microphone', totalAccesses: 4 }),
        // Defensive: a malformed partial map should not poison the sum.
        { ...makeSensor({ sensor: 'location' }), totalAccesses: NaN as unknown as number },
      ],
    };

    expect(totalAccessCount(report)).toBe(16);
  });

  it('returns 0 for a null/empty report', () => {
    expect(totalAccessCount(null)).toBe(0);
    expect(totalAccessCount(undefined)).toBe(0);
    expect(totalAccessCount({ generatedAt: 0, sensors: [] })).toBe(0);
  });

  it('maps every sensor in the report to a view preserving order', () => {
    const report: PrivacyReport = {
      generatedAt: 1,
      sensors: [
        makeSensor({ sensor: 'camera', topApps: [{ packageName: 'com.c', appName: 'C', count: 3 }] }),
        makeSensor({ sensor: 'microphone' }),
        makeSensor({ sensor: 'location', topApps: [{ packageName: 'com.m', appName: 'M', count: 1 }] }),
        makeSensor({ sensor: 'network' }),
      ],
    };

    const views = toPrivacySensorViews(report);
    expect(views.map((v) => v.sensor)).toEqual(['camera', 'microphone', 'location', 'network']);
    expect(views[0].breakdown).toHaveLength(1);
    expect(views[1].hasAccesses).toBe(false);
  });
});
