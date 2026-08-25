/**
 * Motor de acumulação do Scheduled Summary (issue #630, sub-issue 1).
 *
 * `routeNotification` (notificationAppRules.ts) já classifica as apps com
 * política 'scheduled'/'digest' como `{ action: 'suppress', reason: 'batched' }`,
 * mas quem recebe essa decisão (notificationFocusFilter.ts) descartava a
 * notificação. Este módulo é o buffer que faltava: guarda o lote em memória e
 * persiste-o no AsyncStorage para sobreviver a um reload da app.
 *
 * Mapa política -> slot de libertação do resumo:
 *   'scheduled' -> slot 'morning'
 *   'digest'    -> slot 'evening'
 *   'both'      -> os dois lotes, na ordem morning, evening
 *
 * A libertação no horário é a sub-issue 2 — aqui só se acumula e se liberta
 * quando alguém pede.
 *
 * O AsyncStorage é tratado como um blob não confiável (mesmo padrão de
 * `normalizePerAppDelivery`): tudo o que se lê passa por
 * `normalizeSummaryBuffer` antes de entrar no buffer em memória.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AppDeliveryPolicy,
  IncomingNotification,
  NotificationRouteContext,
} from './notificationAppRules';

export const SUMMARY_BUFFER_STORAGE_KEY = '@iostoandroid/notification_summary_buffer';

/** Políticas que produzem acumulação (as restantes nunca entram no buffer). */
export type BatchedPolicy = Extract<AppDeliveryPolicy, 'scheduled' | 'digest'>;

/** Slots de libertação do Scheduled Summary. */
export type SummarySlot = 'morning' | 'evening' | 'both';

/** Notificação acumulada: a forma recebida mais o instante da captura. */
export interface BatchedNotification {
  id: string;
  title?: string;
  text?: string;
  packageName?: string;
  capturedAt: number;
}

/** Lote acumulado, indexado pela política que o originou. */
export interface SummaryBuffer {
  scheduled: BatchedNotification[];
  digest: BatchedNotification[];
}

/**
 * Tecto por política. Um listener nativo pode disparar milhares de vezes entre
 * dois slots; sem tecto o blob do AsyncStorage cresce sem limite. Ao atingir o
 * tecto descarta-se a entrada mais antiga (FIFO), como o `seenIds` do caller.
 */
export const SUMMARY_BUFFER_MAX_PER_POLICY = 200;

const SLOT_FOR_POLICY: Record<BatchedPolicy, Exclude<SummarySlot, 'both'>> = {
  scheduled: 'morning',
  digest: 'evening',
};

const POLICY_FOR_SLOT: Record<Exclude<SummarySlot, 'both'>, BatchedPolicy> = {
  morning: 'scheduled',
  evening: 'digest',
};

function emptyBuffer(): SummaryBuffer {
  return { scheduled: [], digest: [] };
}

let buffer: SummaryBuffer = emptyBuffer();

/** Slot em que uma política é libertada. */
export function slotForPolicy(policy: BatchedPolicy): Exclude<SummarySlot, 'both'> {
  return SLOT_FOR_POLICY[policy];
}

/**
 * Normaliza o blob lido do AsyncStorage para um SummaryBuffer canónico.
 * Descarta não-objectos, chaves desconhecidas, entradas sem `id` string
 * não-vazia, campos de texto que não sejam string, e `capturedAt` não
 * numérico (substituído por 0, que ordena antes de qualquer captura real).
 * Dedupica por `id` dentro de cada política e respeita o tecto.
 */
export function normalizeSummaryBuffer(raw: unknown): SummaryBuffer {
  const out = emptyBuffer();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const record = raw as Record<string, unknown>;
  for (const policy of ['scheduled', 'digest'] as BatchedPolicy[]) {
    const list = record[policy];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== 'string' || e.id.length === 0) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const normalized: BatchedNotification = {
        id: e.id,
        capturedAt: typeof e.capturedAt === 'number' && Number.isFinite(e.capturedAt) ? e.capturedAt : 0,
      };
      if (typeof e.title === 'string') normalized.title = e.title;
      if (typeof e.text === 'string') normalized.text = e.text;
      if (typeof e.packageName === 'string') normalized.packageName = e.packageName;
      out[policy].push(normalized);
      if (out[policy].length >= SUMMARY_BUFFER_MAX_PER_POLICY) break;
    }
  }
  return out;
}

function persist(): void {
  // Escrita best-effort: uma falha de disco não pode derrubar o listener de
  // notificações, mas o buffer em memória mantém-se válido nesta sessão.
  void AsyncStorage.setItem(SUMMARY_BUFFER_STORAGE_KEY, JSON.stringify(buffer)).catch(() => {});
}

/**
 * Deduz a política de acumulação de uma notificação a partir do contexto de
 * routing. Devolve null quando a app não é de resumo (immediate, blocked, ou
 * sem entrada) — nesse caso não há nada a acumular.
 */
export function batchedPolicyFor(
  n: IncomingNotification | null | undefined,
  ctx?: NotificationRouteContext | null,
): BatchedPolicy | null {
  if (!n) return null;
  const policy = ctx?.perAppDelivery?.[n.packageName ?? ''];
  if (policy === 'scheduled' || policy === 'digest') return policy;
  return null;
}

/**
 * Acumula uma notificação classificada como 'batched'.
 *
 * Devolve a entrada guardada, ou null quando nada foi acumulado — notificação
 * sem `id`, app que não é de resumo (inclui 'blocked'), ou `id` repetido (o
 * duplo evento da bridge nativa não deve duplicar o item no resumo).
 */
export function captureBatched(
  n: IncomingNotification | null | undefined,
  ctx?: NotificationRouteContext | null,
): BatchedNotification | null {
  if (!n || typeof n.id !== 'string' || n.id.length === 0) return null;
  const policy = batchedPolicyFor(n, ctx);
  if (!policy) return null;

  const list = buffer[policy];
  if (list.some((e) => e.id === n.id)) return null;

  const entry: BatchedNotification = { id: n.id, capturedAt: Date.now() };
  if (typeof n.title === 'string') entry.title = n.title;
  if (typeof n.text === 'string') entry.text = n.text;
  if (typeof n.packageName === 'string') entry.packageName = n.packageName;

  list.push(entry);
  while (list.length > SUMMARY_BUFFER_MAX_PER_POLICY) list.shift();
  persist();
  return entry;
}

/** Lê o lote de um slot sem o esvaziar (cópia; o buffer não é exposto). */
export function peekBatched(slot: SummarySlot): BatchedNotification[] {
  if (slot === 'both') return [...buffer.scheduled, ...buffer.digest];
  return [...buffer[POLICY_FOR_SLOT[slot]]];
}

/**
 * Devolve e esvazia o lote acumulado para um slot. Chamar duas vezes seguidas
 * devolve [] na segunda — o lote sai uma única vez.
 */
export function releaseBatched(slot: SummarySlot): BatchedNotification[] {
  const released = peekBatched(slot);
  if (slot === 'both') {
    buffer = emptyBuffer();
  } else {
    buffer[POLICY_FOR_SLOT[slot]] = [];
  }
  persist();
  return released;
}

/**
 * Repõe o buffer em memória a partir do AsyncStorage (chamar no arranque da
 * app, e nos testes para simular um reload). Devolve o buffer hidratado.
 */
export async function hydrateBatchedBuffer(): Promise<SummaryBuffer> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(SUMMARY_BUFFER_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    buffer = emptyBuffer();
    return { scheduled: [], digest: [] };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  buffer = normalizeSummaryBuffer(parsed);
  return { scheduled: [...buffer.scheduled], digest: [...buffer.digest] };
}

/** Esvazia o buffer em memória sem tocar no AsyncStorage (usado nos testes). */
export function resetBatchedBufferForTests(): void {
  buffer = emptyBuffer();
}
