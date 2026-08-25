/**
 * Buffer persistido das notificações suprimidas por `routeNotification` com
 * `reason: 'batched'` (apps em política 'scheduled'/'digest', issue #630) —
 * pré-requisito ("sub-issue 1 / engine") do scheduler do Scheduled Summary
 * (issue #869). Não existia neste repositório em nenhum branch; implementado
 * aqui com o contrato exigido pelo #869: `captureBatched(n)` /
 * `releaseBatched(slot)`.
 *
 * Persistido em AsyncStorage (não só em memória) para que uma app reiniciada
 * entre a captura e a libertação ainda tenha o que foi capturado antes de
 * fechar.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/scheduled_summary_buffer';

export interface BatchedNotification {
  id: string;
  title?: string;
  text?: string;
  packageName?: string;
}

export type ScheduledSummarySlot = 'morning' | 'evening';

export interface ReleasedScheduledSummary {
  slot: ScheduledSummarySlot;
  count: number;
  items: BatchedNotification[];
}

// Cache em memória do processo actual; `null` significa "ainda não lido do
// AsyncStorage nesta instância do módulo" (distinto de já lido e vazio).
let cache: BatchedNotification[] | null = null;

async function readBuffer(): Promise<BatchedNotification[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as BatchedNotification[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function writeBuffer(next: BatchedNotification[]): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sem persistência (AsyncStorage indisponível): o buffer fica só em
    // memória até ao próximo capture/release desta instância do processo.
  }
}

/** Guarda uma notificação embalada até ao próximo `releaseBatched` do slot correspondente. */
export async function captureBatched(n: BatchedNotification): Promise<void> {
  const buffer = await readBuffer();
  await writeBuffer([...buffer, n]);
}

/** Liberta e esvazia o buffer, devolvendo o que estava guardado para o slot indicado. */
export async function releaseBatched(slot: ScheduledSummarySlot): Promise<ReleasedScheduledSummary> {
  const buffer = await readBuffer();
  await writeBuffer([]);
  return { slot, count: buffer.length, items: buffer };
}
