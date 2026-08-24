import {
  aggregateDaily,
  aggregateWeekly,
  aggregateMonthly,
  DailySteps,
  Bucket,
} from '../healthAggregation';

// Helper: assert a bucket exists with exact total/steps/avg/dayCount.
function expectBucket(
  buckets: Bucket[],
  label: string,
  totalSteps: number,
  averageSteps: number,
  dayCount: number,
): void {
  const b = buckets.find((x) => x.label === label);
  expect(b).toBeDefined();
  if (!b) return;
  expect(b.totalSteps).toBe(totalSteps);
  expect(b.averageSteps).toBeCloseTo(averageSteps, 10);
  expect(b.dayCount).toBe(dayCount);
}

describe('aggregateDaily', () => {
  it('returns [] for an empty input (no throw)', () => {
    expect(aggregateDaily([])).toEqual([]);
  });

  it('returns one bucket per unique date, sorted ascending, last write wins on duplicates', () => {
    const samples: DailySteps[] = [
      { date: '2026-08-18', steps: 100 },
      { date: '2026-08-19', steps: 200 },
      { date: '2026-08-17', steps: 50 },
      { date: '2026-08-18', steps: 150 }, // duplicate: last entry wins
    ];
    const result = aggregateDaily(samples);
    expect(result.map((b) => b.label)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ]);
    expectBucket(result, '2026-08-17', 50, 50, 1);
    expectBucket(result, '2026-08-18', 150, 150, 1); // 150, not 100
    expectBucket(result, '2026-08-19', 200, 200, 1);
  });

  it('handles unsorted input spanning a month boundary', () => {
    const samples: DailySteps[] = [
      { date: '2026-09-01', steps: 60 },
      { date: '2026-08-31', steps: 40 },
    ];
    const result = aggregateDaily(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-08-31', '2026-09-01']);
    expectBucket(result, '2026-08-31', 40, 40, 1);
    expectBucket(result, '2026-09-01', 60, 60, 1);
  });

  it('handles unsorted input spanning a year boundary (Dec 31 -> Jan 1)', () => {
    const samples: DailySteps[] = [
      { date: '2027-01-01', steps: 20 },
      { date: '2026-12-31', steps: 10 },
    ];
    const result = aggregateDaily(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-12-31', '2027-01-01']);
    expectBucket(result, '2026-12-31', 10, 10, 1);
    expectBucket(result, '2027-01-01', 20, 20, 1);
  });
});

describe('aggregateWeekly', () => {
  it('returns [] for an empty input (no throw)', () => {
    expect(aggregateWeekly([])).toEqual([]);
  });

  it('buckets by ISO week (Monday-start) and sorts ascending', () => {
    const samples: DailySteps[] = [
      { date: '2026-08-19', steps: 300 }, // Wed, W34
      { date: '2026-08-18', steps: 100 }, // Tue, W34
      { date: '2026-08-10', steps: 50 }, // Mon, W33
    ];
    const result = aggregateWeekly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-W33', '2026-W34']);
    expectBucket(result, '2026-W33', 50, 50, 1);
    expectBucket(result, '2026-W34', 400, 200, 2); // (100+300)/2
  });

  it('buckets a Sunday into the week that started the preceding Monday', () => {
    // 2026-08-16 is a Sunday; its week started Monday 2026-08-10 -> 2026-W33.
    const samples: DailySteps[] = [
      { date: '2026-08-10', steps: 10 }, // Mon, W33
      { date: '2026-08-16', steps: 20 }, // Sun, W33
    ];
    const result = aggregateWeekly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-W33']);
    expectBucket(result, '2026-W33', 30, 15, 2);
  });

  it('dedupes duplicate dates (last write wins) before weekly totals', () => {
    const samples: DailySteps[] = [
      { date: '2026-08-10', steps: 10 },
      { date: '2026-08-11', steps: 20 },
      { date: '2026-08-10', steps: 99 }, // duplicate, last wins -> 99
    ];
    const result = aggregateWeekly(samples);
    expectBucket(result, '2026-W33', 119, 59.5, 2); // 99 + 20, over 2 days
  });

  it('spans a month boundary inside a single week (Aug 31 Mon + Sep 1 Tue)', () => {
    const samples: DailySteps[] = [
      { date: '2026-09-01', steps: 60 }, // Tue, W36
      { date: '2026-08-31', steps: 40 }, // Mon, W36
    ];
    const result = aggregateWeekly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-W36']);
    expectBucket(result, '2026-W36', 100, 50, 2); // days present = 2, NOT 7
  });

  it('spans a year boundary inside a single week (Dec 31 Thu + Jan 1 Fri)', () => {
    const samples: DailySteps[] = [
      { date: '2027-01-01', steps: 20 }, // Fri, W53 (ISO year 2026)
      { date: '2026-12-31', steps: 10 }, // Thu, W53
    ];
    const result = aggregateWeekly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-W53']);
    expectBucket(result, '2026-W53', 30, 15, 2);
  });

  it('does not dilute average by calendar days: a partial week uses days present', () => {
    // Only one day in the week present.
    const samples: DailySteps[] = [{ date: '2026-08-10', steps: 70 }];
    const result = aggregateWeekly(samples);
    expectBucket(result, '2026-W33', 70, 70, 1); // avg = 70/1, not 70/7
  });
});

describe('aggregateMonthly', () => {
  it('returns [] for an empty input (no throw)', () => {
    expect(aggregateMonthly([])).toEqual([]);
  });

  it('groups by calendar month and sorts ascending', () => {
    const samples: DailySteps[] = [
      { date: '2026-08-19', steps: 300 },
      { date: '2026-08-18', steps: 100 },
      { date: '2026-07-31', steps: 50 },
    ];
    const result = aggregateMonthly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-07', '2026-08']);
    expectBucket(result, '2026-07', 50, 50, 1);
    expectBucket(result, '2026-08', 400, 200, 2); // (100+300)/2
  });

  it('dedupes duplicate dates (last write wins) before monthly totals', () => {
    const samples: DailySteps[] = [
      { date: '2026-08-10', steps: 10 },
      { date: '2026-08-11', steps: 20 },
      { date: '2026-08-10', steps: 99 }, // last wins -> 99
    ];
    const result = aggregateMonthly(samples);
    expectBucket(result, '2026-08', 119, 59.5, 2);
  });

  it('spans a month boundary into two distinct month buckets', () => {
    const samples: DailySteps[] = [
      { date: '2026-09-01', steps: 60 },
      { date: '2026-08-31', steps: 40 },
    ];
    const result = aggregateMonthly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-08', '2026-09']);
    expectBucket(result, '2026-08', 40, 40, 1);
    expectBucket(result, '2026-09', 60, 60, 1);
  });

  it('spans a year boundary into two distinct month buckets (Dec 31 -> Jan 1)', () => {
    const samples: DailySteps[] = [
      { date: '2027-01-01', steps: 20 },
      { date: '2026-12-31', steps: 10 },
    ];
    const result = aggregateMonthly(samples);
    expect(result.map((b) => b.label)).toEqual(['2026-12', '2027-01']);
    expectBucket(result, '2026-12', 10, 10, 1);
    expectBucket(result, '2027-01', 20, 20, 1);
  });

  it('does not dilute average by calendar days: partial month uses days present', () => {
    // Only one day present in August; avg must be steps/1, not steps/31.
    const samples: DailySteps[] = [{ date: '2026-08-10', steps: 310 }];
    const result = aggregateMonthly(samples);
    expectBucket(result, '2026-08', 310, 310, 1); // avg = 310/1, not 310/31
  });
});
