// Pure, dependency-free step aggregation for the Health step-counter feature.
// No device access, no React — unit testable directly with fixed fixtures.
//
// Data shape (from the step-counter foundation, part of #124):
//   HealthStore persists an array of { date: 'YYYY-MM-DD'; steps: number }
//   under AsyncStorage key '@iostoandroid/health_daily_steps'.
//
// Input is assumed to be a flat list of daily samples that may be:
//   - unsorted
//   - gappy (missing days)
//   - duplicated per date (last write wins — HealthStore overwrites today's
//     entry as it accumulates)
// Output buckets are sorted ascending by label.

export interface DailySteps {
  date: string; // 'YYYY-MM-DD' — local calendar date
  steps: number;
}

export interface Bucket {
  label: string; // '2026-08-18', '2026-W33', or '2026-08'
  totalSteps: number;
  averageSteps: number; // totalSteps / dayCount (days with data, not calendar days)
  dayCount: number; // days actually present in the input, not calendar days
}

// --- internal helpers -------------------------------------------------------

function dedupeByDate(samples: DailySteps[]): Map<string, number> {
  // Insertion order preserved; later duplicate overwrites earlier (last write wins).
  const byDate = new Map<string, number>();
  for (const sample of samples) {
    byDate.set(sample.date, sample.steps);
  }
  return byDate;
}

function toBuckets(
  byDate: Map<string, number>,
  keyFor: (date: string) => string,
): Bucket[] {
  const totals = new Map<string, { total: number; days: number }>();
  for (const [date, steps] of byDate) {
    const key = keyFor(date);
    const entry = totals.get(key) ?? { total: 0, days: 0 };
    entry.total += steps;
    entry.days += 1;
    totals.set(key, entry);
  }
  const buckets: Bucket[] = [];
  for (const [label, { total, days }] of totals) {
    buckets.push({
      label,
      totalSteps: total,
      dayCount: days,
      averageSteps: days > 0 ? total / days : 0,
    });
  }
  buckets.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return buckets;
}

// ISO week label for a 'YYYY-MM-DD' date, Monday-start, per ISO-8601.
// The week-year is the year of the Thursday of that week, so Dec 31 / Jan 1
// that belong to a neighbouring ISO year are labelled with that year
// (e.g. Fri 2027-01-01 is '2026-W53'). Computed in UTC to avoid DST drift.
function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  // Thursday of this ISO week (always in the same ISO year as the week).
  const thursday = new Date(Date.UTC(y, m - 1, d - dayOfWeek + 3));
  const tYear = thursday.getUTCFullYear();
  // First Monday of the ISO year: Jan 4 is always in week 1.
  const jan4 = new Date(Date.UTC(tYear, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const firstMonday = new Date(Date.UTC(tYear, 0, 4 - jan4Dow));
  const week =
    1 + Math.round((thursday.getTime() - firstMonday.getTime()) / (7 * 86_400_000));
  return `${tYear}-W${String(week).padStart(2, '0')}`;
}

// --- public API -------------------------------------------------------------

export function aggregateDaily(samples: DailySteps[]): Bucket[] {
  if (samples.length === 0) return [];
  const byDate = dedupeByDate(samples);
  return toBuckets(byDate, (date) => date);
}

export function aggregateWeekly(samples: DailySteps[]): Bucket[] {
  if (samples.length === 0) return [];
  const byDate = dedupeByDate(samples);
  return toBuckets(byDate, (date) => isoWeekKey(date));
}

export function aggregateMonthly(samples: DailySteps[]): Bucket[] {
  if (samples.length === 0) return [];
  const byDate = dedupeByDate(samples);
  return toBuckets(byDate, (date) => date.slice(0, 7)); // 'YYYY-MM'
}
