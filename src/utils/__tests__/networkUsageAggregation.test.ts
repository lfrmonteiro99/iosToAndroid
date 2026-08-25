import {
  formatNetworkBytes,
  sortNetworkUsageByTotalDesc,
  totalNetworkBytes,
  type NetworkUsageApp,
} from '../networkUsageAggregation';

function app(over: Partial<NetworkUsageApp> = {}): NetworkUsageApp {
  return {
    packageName: 'com.example.app',
    appName: 'Example',
    txBytes: 0,
    rxBytes: 0,
    ...over,
  };
}

describe('formatNetworkBytes', () => {
  it('formats a whole-number MB value with one decimal', () => {
    // 350 bytes delta from the issue's own worked example, scaled up to MB.
    expect(formatNetworkBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('rounds to one decimal place', () => {
    expect(formatNetworkBytes(1.25 * 1024 * 1024)).toBe('1.3 MB');
  });

  it('shows "< 0.1 MB" for a non-zero value below one tenth of a MB', () => {
    expect(formatNetworkBytes(1024)).toBe('< 0.1 MB');
  });

  it('shows "0 MB" for exactly zero bytes', () => {
    expect(formatNetworkBytes(0)).toBe('0 MB');
  });

  it('treats negative or non-finite input as zero rather than a negative label', () => {
    expect(formatNetworkBytes(-500)).toBe('0 MB');
    expect(formatNetworkBytes(NaN)).toBe('0 MB');
  });
});

describe('totalNetworkBytes', () => {
  it('sums tx and rx for one app', () => {
    expect(totalNetworkBytes(app({ txBytes: 100, rxBytes: 250 }))).toBe(350);
  });
});

describe('sortNetworkUsageByTotalDesc', () => {
  it('orders apps by tx+rx bytes, highest first', () => {
    const low = app({ packageName: 'low', txBytes: 10, rxBytes: 10 });
    const high = app({ packageName: 'high', txBytes: 1000, rxBytes: 1000 });
    const mid = app({ packageName: 'mid', txBytes: 100, rxBytes: 100 });
    expect(sortNetworkUsageByTotalDesc([low, high, mid]).map((a) => a.packageName)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [app({ packageName: 'a', txBytes: 1 }), app({ packageName: 'b', txBytes: 2 })];
    const copy = [...input];
    sortNetworkUsageByTotalDesc(input);
    expect(input).toEqual(copy);
  });

  it('returns an empty array for empty input', () => {
    expect(sortNetworkUsageByTotalDesc([])).toEqual([]);
  });

  it('keeps a single app as-is', () => {
    const single = app({ packageName: 'solo' });
    expect(sortNetworkUsageByTotalDesc([single])).toEqual([single]);
  });
});
