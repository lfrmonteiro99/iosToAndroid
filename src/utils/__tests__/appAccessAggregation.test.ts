import {
  aggregateAppAccessByType,
  ACCESS_TYPE_PERMISSION,
  ACCESS_TYPE_LABELS,
  type RawAccessEvent,
} from '../appAccessAggregation';

const HOUR = 3600_000;
const now = () => Date.now();

function ev(over: Partial<RawAccessEvent> = {}): RawAccessEvent {
  return {
    packageName: 'com.example.app',
    accessType: 'camera',
    // Default to slightly in the past so it always falls inside any trailing
    // window and never trips the util's "future-dated" guard.
    timestamp: now() - 10_000,
    ...over,
  };
}

describe('aggregateAppAccessByType', () => {
  it('returns an empty map when there are no events', () => {
    const result = aggregateAppAccessByType([], 24);
    expect(result).toEqual({});
  });

  it('counts one access per package/type for a single event', () => {
    const result = aggregateAppAccessByType([ev({ packageName: 'a', accessType: 'camera' })], 24);
    expect(result['a'].camera.count).toBe(1);
    expect(result['a'].camera.packageName).toBe('a');
    expect(result['a'].camera.appName).toBe('a');
  });

  it('sums counts and keeps the most recent timestamp per package/type', () => {
    const base = now() - (3 * HOUR + 5000);
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: base }),
      ev({ packageName: 'a', accessType: 'camera', timestamp: base + HOUR }),
      ev({ packageName: 'a', accessType: 'camera', timestamp: base + 2 * HOUR }),
    ];
    const result = aggregateAppAccessByType(events, 24);
    expect(result['a'].camera.count).toBe(3);
    expect(result['a'].camera.lastAccess).toBe(base + 2 * HOUR);
  });

  it('separates different access types into distinct buckets for the same package', () => {
    const base = now() - (3 * HOUR + 5000);
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: base }),
      ev({ packageName: 'a', accessType: 'microphone', timestamp: base + HOUR }),
      ev({ packageName: 'a', accessType: 'location', timestamp: base + 2 * HOUR }),
    ];
    const result = aggregateAppAccessByType(events, 24);
    expect(result['a'].camera.count).toBe(1);
    expect(result['a'].microphone.count).toBe(1);
    expect(result['a'].location.count).toBe(1);
  });

  it('separates different packages for the same access type', () => {
    const base = now() - (2 * HOUR + 5000);
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: base }),
      ev({ packageName: 'b', accessType: 'camera', timestamp: base + HOUR }),
    ];
    const result = aggregateAppAccessByType(events, 24);
    expect(result['a'].camera.count).toBe(1);
    expect(result['b'].camera.count).toBe(1);
  });

  // Fronteira: janela de 24h. Um evento EXACTAMENTE à hora atual entra; um
  // evento a 24h+1ms cai fora. Isto é a fronteira que o issue pede ("últimas
  // 24h") e a que decidimos documentar como inclusiva no limite inferior.
  it('includes an event exactly within the window and excludes one older than 24h', () => {
    const t = now();
    const inside = ev({ packageName: 'a', accessType: 'camera', timestamp: t - (24 * HOUR) + 1 });
    const outside = ev({ packageName: 'b', accessType: 'camera', timestamp: t - (24 * HOUR) - 1 });
    const result = aggregateAppAccessByType([inside, outside], 24);
    expect(result['a'].camera.count).toBe(1);
    expect(result['b']).toBeUndefined();
  });

  it('drops events older than the requested window regardless of type', () => {
    const t = now();
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: t - 24 * HOUR - 5 }),
      ev({ packageName: 'a', accessType: 'microphone', timestamp: t - 24 * HOUR + 5 }),
    ];
    const result = aggregateAppAccessByType(events, 24);
    expect(result['a'].camera).toBeUndefined();
    expect(result['a'].microphone.count).toBe(1);
  });

  it('supports a non-24h window (boundary at the exact limit)', () => {
    const t = now();
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: t - 12 * HOUR }),
      ev({ packageName: 'b', accessType: 'camera', timestamp: t - 12 * HOUR - 1 }),
    ];
    const result = aggregateAppAccessByType(events, 12);
    expect(result['a'].camera.count).toBe(1);
    expect(result['b']).toBeUndefined();
  });

  // Valores inválidos/hostis: um evento sem timestamp, com timestamp no
  // futuro, ou com packageName vazio NÃO deve rebentar o agregador nem poluir
  // o mapa. O filtro de janela já trata disso (future/NaN caem fora).
  it('ignores events with a missing or non-finite timestamp', () => {
    const events: RawAccessEvent[] = [
      ev({ packageName: 'a', accessType: 'camera', timestamp: Number.NaN }),
      // A hostile bridge could drop the field entirely; the aggregator must
      // treat an absent/undefined timestamp as out-of-window, not crash or bucket it.
      ev({ packageName: 'a', accessType: 'camera', ...({ timestamp: undefined } as object) }),
    ];
    const result = aggregateAppAccessByType(events, 24);
    expect(result).toEqual({});
  });

  it('ignores events dated in the future (outside the window)', () => {
    const events: RawAccessEvent[] = [ev({ packageName: 'a', accessType: 'camera', timestamp: now() + HOUR })];
    expect(aggregateAppAccessByType(events, 24)).toEqual({});
  });

  it('ignores events with an empty packageName instead of keying them together', () => {
    const events: RawAccessEvent[] = [
      ev({ packageName: '', accessType: 'camera' }),
      ev({ packageName: '', accessType: 'camera' }),
    ];
    expect(aggregateAppAccessByType(events, 24)).toEqual({});
  });

  it('does not mutate the input array', () => {
    const events = [ev({ packageName: 'a', accessType: 'camera' })];
    const snapshot = JSON.stringify(events);
    aggregateAppAccessByType(events, 24);
    expect(JSON.stringify(events)).toBe(snapshot);
  });

  it('exposes the canonical permission constants and labels for all three types', () => {
    expect(ACCESS_TYPE_PERMISSION.camera).toBe(androidCameraPermission);
    expect(ACCESS_TYPE_PERMISSION.microphone).toBe(androidMicPermission);
    expect(ACCESS_TYPE_PERMISSION.location).toBe(androidLocationPermission);
    expect(Object.keys(ACCESS_TYPE_LABELS).sort()).toEqual(['camera', 'location', 'microphone']);
  });
});

// Imported at the bottom so the @ts-expect-error above stays adjacent to its use.
import {
  androidCameraPermission,
  androidMicPermission,
  androidLocationPermission,
} from '../appAccessAggregation';
