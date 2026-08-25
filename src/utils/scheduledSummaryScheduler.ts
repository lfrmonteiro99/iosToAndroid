/**
 * Scheduler do Scheduled Summary (issue #869, sub-issue 2 de #630/#838).
 *
 * Lê `settings.scheduledSummaryIdx` e decide, a cada avaliação do relógio, se
 * algum slot configurado ('morning' 8:00 / 'evening' 18:00) já cruzou a sua
 * hora hoje e ainda não foi libertado — nesse caso chama `releaseBatched(slot)`
 * (engine de `scheduledSummaryBuffer.ts`) e mostra um único banner-resumo
 * agregado. Mapeamento do índice: 0='Off' (nenhum slot, nunca liberta),
 * 1='Morning', 2='Evening', 3='Both'.
 *
 * Lógica pura e testável sem montar App.tsx — o wiring (setInterval,
 * setBanner real) fica em App.tsx, ao lado do `addNotificationListener`.
 */
import type { BannerNotification } from '../components/NotificationBanner';
import type { ReleasedScheduledSummary, ScheduledSummarySlot } from './scheduledSummaryBuffer';

export const SCHEDULED_SUMMARY_SLOT_TIMES: Record<ScheduledSummarySlot, number> = {
  morning: 8 * 60, // 08:00
  evening: 18 * 60, // 18:00
};

export const SCHEDULED_SUMMARY_CHECK_MS = 30_000;

/** 0=Off, 1=Morning 8:00, 2=Evening 18:00, 3=Both. Qualquer outro valor = Off. */
export function slotsForScheduledSummaryIdx(idx: number): ScheduledSummarySlot[] {
  switch (idx) {
    case 1: return ['morning'];
    case 2: return ['evening'];
    case 3: return ['morning', 'evening'];
    default: return [];
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Regista, por slot, a última data (dayKey) em que já foi libertado — evita libertar duas vezes no mesmo dia. */
export interface ScheduledSummaryTracker {
  morning: string | null;
  evening: string | null;
}

export function createScheduledSummaryTracker(): ScheduledSummaryTracker {
  return { morning: null, evening: null };
}

/**
 * Slots configurados que já cruzaram a sua hora hoje e ainda não foram
 * libertados. Muta `tracker` in-place ao marcar os que devolve como devidos —
 * chamar duas vezes seguidas no mesmo instante não repete o mesmo slot.
 */
export function dueScheduledSummarySlots(
  now: Date,
  scheduledSummaryIdx: number,
  tracker: ScheduledSummaryTracker,
): ScheduledSummarySlot[] {
  const configured = slotsForScheduledSummaryIdx(scheduledSummaryIdx);
  if (configured.length === 0) return [];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = dayKey(now);
  const due: ScheduledSummarySlot[] = [];

  for (const slot of configured) {
    if (tracker[slot] === today) continue;
    if (nowMinutes >= SCHEDULED_SUMMARY_SLOT_TIMES[slot]) {
      due.push(slot);
      tracker[slot] = today;
    }
  }
  return due;
}

const SLOT_TITLE: Record<ScheduledSummarySlot, string> = {
  morning: 'Morning Summary',
  evening: 'Evening Summary',
};

/** Banner-resumo agregado a partir do que `releaseBatched` devolveu; `null` quando não havia nada para mostrar. */
export function buildScheduledSummaryBanner(released: ReleasedScheduledSummary): BannerNotification | null {
  if (released.count === 0) return null;
  return {
    id: `scheduled-summary-${released.slot}`,
    appName: 'Scheduled Summary',
    iconName: 'time-outline',
    iconColor: '#8E8E93',
    title: SLOT_TITLE[released.slot],
    body: `${released.count} notificaç${released.count === 1 ? 'ão' : 'ões'} em espera`,
  };
}

export interface RunScheduledSummaryCheckDeps {
  now: Date;
  scheduledSummaryIdx: number;
  tracker: ScheduledSummaryTracker;
  releaseBatched: (slot: ScheduledSummarySlot) => Promise<ReleasedScheduledSummary>;
  setBanner: (b: BannerNotification) => void;
}

/** Avalia os slots devidos, liberta-os, e mostra o banner-resumo só quando há algo capturado. */
export async function runScheduledSummaryCheck(deps: RunScheduledSummaryCheckDeps): Promise<void> {
  const due = dueScheduledSummarySlots(deps.now, deps.scheduledSummaryIdx, deps.tracker);
  for (const slot of due) {
    const released = await deps.releaseBatched(slot);
    const banner = buildScheduledSummaryBanner(released);
    if (banner) deps.setBanner(banner);
  }
}
