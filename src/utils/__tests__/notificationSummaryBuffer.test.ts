import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  captureBatched,
  releaseBatched,
  peekBatched,
  hydrateBatchedBuffer,
  normalizeSummaryBuffer,
  resetBatchedBufferForTests,
  slotForPolicy,
  SUMMARY_BUFFER_STORAGE_KEY,
  SUMMARY_BUFFER_MAX_PER_POLICY,
} from '../notificationSummaryBuffer';
import { notificationCallbackForFocus } from '../notificationFocusFilter';
import type { IncomingNotification, NotificationRouteContext } from '../notificationAppRules';

const store = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

const N = (id: string, pkg: string): IncomingNotification => ({
  id,
  title: `t-${id}`,
  text: `b-${id}`,
  packageName: pkg,
});

const CTX = (perAppDelivery: NotificationRouteContext['perAppDelivery']): NotificationRouteContext => ({
  focusMode: 'off',
  perAppDelivery,
});

beforeEach(() => {
  resetBatchedBufferForTests();
  store.getItem.mockReset();
  store.getItem.mockResolvedValue(null);
  store.setItem.mockReset();
  store.setItem.mockResolvedValue(undefined);
});

describe('captureBatched / releaseBatched — issue #630 sub-issue 1', () => {
  it('acumula duas notificações digest e liberta-as no slot evening, deixando o buffer vazio', () => {
    const ctx = CTX({ 'com.news': 'digest' });
    expect(captureBatched(N('a', 'com.news'), ctx)).not.toBeNull();
    expect(captureBatched(N('b', 'com.news'), ctx)).not.toBeNull();

    const released = releaseBatched('evening');
    expect(released.map((e) => e.id)).toEqual(['a', 'b']);
    expect(released[0].title).toBe('t-a');
    expect(released[0].packageName).toBe('com.news');
    expect(releaseBatched('evening')).toEqual([]);
    expect(peekBatched('both')).toEqual([]);
  });

  it('acumula scheduled no slot morning, separado de digest', () => {
    captureBatched(N('s1', 'com.sched'), CTX({ 'com.sched': 'scheduled' }));
    captureBatched(N('d1', 'com.news'), CTX({ 'com.news': 'digest' }));

    expect(releaseBatched('morning').map((e) => e.id)).toEqual(['s1']);
    // Só o lote morning saiu; digest continua lá.
    expect(peekBatched('evening').map((e) => e.id)).toEqual(['d1']);
  });

  it("slot 'both' devolve os dois lotes e esvazia ambos", () => {
    captureBatched(N('s1', 'com.sched'), CTX({ 'com.sched': 'scheduled' }));
    captureBatched(N('d1', 'com.news'), CTX({ 'com.news': 'digest' }));

    expect(releaseBatched('both').map((e) => e.id)).toEqual(['s1', 'd1']);
    expect(peekBatched('morning')).toEqual([]);
    expect(peekBatched('evening')).toEqual([]);
  });

  it('mapeia política -> slot', () => {
    expect(slotForPolicy('scheduled')).toBe('morning');
    expect(slotForPolicy('digest')).toBe('evening');
  });

  // ---- o inverso do fix: o que NÃO deve ser acumulado ----
  it('não acumula uma app blocked', () => {
    expect(captureBatched(N('x', 'com.spam'), CTX({ 'com.spam': 'blocked' }))).toBeNull();
    expect(peekBatched('both')).toEqual([]);
  });

  it('não acumula uma app immediate nem uma app sem política', () => {
    expect(captureBatched(N('x', 'com.slack'), CTX({ 'com.slack': 'immediate' }))).toBeNull();
    expect(captureBatched(N('y', 'com.other'), CTX({}))).toBeNull();
    expect(peekBatched('both')).toEqual([]);
  });

  it('não acumula sem contexto, com contexto nulo, ou com notificação nula', () => {
    expect(captureBatched(N('x', 'com.news'))).toBeNull();
    expect(captureBatched(N('x', 'com.news'), null)).toBeNull();
    expect(captureBatched(null, CTX({ 'com.news': 'digest' }))).toBeNull();
    expect(captureBatched(undefined, CTX({ 'com.news': 'digest' }))).toBeNull();
    expect(peekBatched('both')).toEqual([]);
  });

  it('não acumula uma notificação sem id ou com id vazio', () => {
    const ctx = CTX({ 'com.news': 'digest' });
    expect(captureBatched({ packageName: 'com.news' } as IncomingNotification, ctx)).toBeNull();
    expect(captureBatched({ id: '', packageName: 'com.news' }, ctx)).toBeNull();
    expect(peekBatched('both')).toEqual([]);
  });

  // ---- repetição: o duplo evento da bridge ----
  it('o mesmo id capturado duas vezes seguidas entra uma só vez', () => {
    const ctx = CTX({ 'com.news': 'digest' });
    expect(captureBatched(N('a', 'com.news'), ctx)).not.toBeNull();
    expect(captureBatched(N('a', 'com.news'), ctx)).toBeNull();
    expect(peekBatched('evening')).toHaveLength(1);
  });

  it('peek não esvazia o lote', () => {
    captureBatched(N('a', 'com.news'), CTX({ 'com.news': 'digest' }));
    expect(peekBatched('evening')).toHaveLength(1);
    expect(peekBatched('evening')).toHaveLength(1);
  });

  // ---- fronteira: tecto por política ----
  it('respeita o tecto por política descartando a entrada mais antiga', () => {
    const ctx = CTX({ 'com.news': 'digest' });
    for (let i = 0; i < SUMMARY_BUFFER_MAX_PER_POLICY + 5; i += 1) {
      captureBatched(N(`n${i}`, 'com.news'), ctx);
    }
    const released = releaseBatched('evening');
    expect(released).toHaveLength(SUMMARY_BUFFER_MAX_PER_POLICY);
    expect(released[0].id).toBe('n5');
    expect(released[released.length - 1].id).toBe(`n${SUMMARY_BUFFER_MAX_PER_POLICY + 4}`);
  });
});

describe('captureBatched via notificationCallbackForFocus', () => {
  const mkRefs = () => ({
    seenIds: { current: new Set<string>() },
    focusModeRef: { current: 'off' },
  });

  it('uma notificação batched não mostra banner mas fica acumulada', () => {
    const { seenIds, focusModeRef } = mkRefs();
    const setBanner = jest.fn();
    notificationCallbackForFocus(N('a', 'com.news'), seenIds, focusModeRef, setBanner, CTX({ 'com.news': 'digest' }));

    expect(setBanner).not.toHaveBeenCalled();
    expect(peekBatched('evening').map((e) => e.id)).toEqual(['a']);
  });

  it('uma notificação blocked não mostra banner e não é acumulada', () => {
    const { seenIds, focusModeRef } = mkRefs();
    const setBanner = jest.fn();
    notificationCallbackForFocus(N('x', 'com.spam'), seenIds, focusModeRef, setBanner, CTX({ 'com.spam': 'blocked' }));

    expect(setBanner).not.toHaveBeenCalled();
    expect(peekBatched('both')).toEqual([]);
  });

  it('uma notificação suprimida por Focus não é acumulada', () => {
    const { seenIds, focusModeRef } = mkRefs();
    const setBanner = jest.fn();
    notificationCallbackForFocus(N('f', 'com.news'), seenIds, focusModeRef, setBanner, {
      focusMode: 'work',
      perAppDelivery: { 'com.news': 'digest' },
    });

    expect(setBanner).not.toHaveBeenCalled();
    expect(peekBatched('both')).toEqual([]);
  });

  it('uma notificação normal continua a mostrar banner e não é acumulada', () => {
    const { seenIds, focusModeRef } = mkRefs();
    const setBanner = jest.fn();
    notificationCallbackForFocus(N('ok', 'com.slack'), seenIds, focusModeRef, setBanner, CTX({}));

    expect(setBanner).toHaveBeenCalledTimes(1);
    expect(peekBatched('both')).toEqual([]);
  });
});

describe('persistência (reload)', () => {
  it('mantém o lote depois de um reload simulado', async () => {
    const ctx = CTX({ 'com.news': 'digest' });
    captureBatched(N('a', 'com.news'), ctx);
    captureBatched(N('b', 'com.news'), ctx);

    const writes = store.setItem.mock.calls.filter((c) => c[0] === SUMMARY_BUFFER_STORAGE_KEY);
    expect(writes.length).toBeGreaterThan(0);
    const blob = writes[writes.length - 1][1] as string;

    // Reload: buffer em memória perdido, AsyncStorage devolve o blob escrito.
    resetBatchedBufferForTests();
    expect(peekBatched('evening')).toEqual([]);
    store.getItem.mockResolvedValue(blob);

    await hydrateBatchedBuffer();
    expect(releaseBatched('evening').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('hidrata vazio quando o AsyncStorage devolve null na primeira leitura', async () => {
    store.getItem.mockResolvedValue(null);
    await expect(hydrateBatchedBuffer()).resolves.toEqual({ scheduled: [], digest: [] });
    expect(peekBatched('both')).toEqual([]);
  });

  it('hidrata vazio quando o blob é JSON inválido', async () => {
    store.getItem.mockResolvedValue('{nao-e-json');
    await hydrateBatchedBuffer();
    expect(peekBatched('both')).toEqual([]);
  });

  it('hidrata vazio quando o getItem rejeita', async () => {
    store.getItem.mockRejectedValue(new Error('disco'));
    await hydrateBatchedBuffer();
    expect(peekBatched('both')).toEqual([]);
  });

  it('uma falha de escrita não derruba a captura', () => {
    store.setItem.mockRejectedValue(new Error('disco cheio'));
    expect(captureBatched(N('a', 'com.news'), CTX({ 'com.news': 'digest' }))).not.toBeNull();
    expect(peekBatched('evening')).toHaveLength(1);
  });
});

describe('normalizeSummaryBuffer — blob hostil', () => {
  it('devolve lotes vazios para input não-objecto', () => {
    expect(normalizeSummaryBuffer(null)).toEqual({ scheduled: [], digest: [] });
    expect(normalizeSummaryBuffer('x')).toEqual({ scheduled: [], digest: [] });
    expect(normalizeSummaryBuffer([1, 2])).toEqual({ scheduled: [], digest: [] });
    expect(normalizeSummaryBuffer(undefined)).toEqual({ scheduled: [], digest: [] });
  });

  it('ignora chaves desconhecidas e listas que não são arrays', () => {
    expect(normalizeSummaryBuffer({ blocked: [{ id: 'x' }], scheduled: 'nope', digest: { a: 1 } })).toEqual({
      scheduled: [],
      digest: [],
    });
  });

  it('descarta entradas sem id string, e campos de tipo errado', () => {
    const out = normalizeSummaryBuffer({
      digest: [
        { id: 'ok', title: 'T', text: 'B', packageName: 'com.news', capturedAt: 5 },
        { id: '' },
        { id: 7 },
        null,
        ['a'],
        { id: 'partial', title: 9, text: null, packageName: false, capturedAt: 'ontem' },
      ],
    });
    expect(out.digest).toEqual([
      { id: 'ok', capturedAt: 5, title: 'T', text: 'B', packageName: 'com.news' },
      { id: 'partial', capturedAt: 0 },
    ]);
  });

  it('dedupica por id dentro da mesma política', () => {
    const out = normalizeSummaryBuffer({ digest: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] });
    expect(out.digest.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('trunca no tecto por política', () => {
    const many = Array.from({ length: SUMMARY_BUFFER_MAX_PER_POLICY + 10 }, (_, i) => ({ id: `n${i}` }));
    expect(normalizeSummaryBuffer({ digest: many }).digest).toHaveLength(SUMMARY_BUFFER_MAX_PER_POLICY);
  });

  it('capturedAt não finito vira 0', () => {
    expect(normalizeSummaryBuffer({ digest: [{ id: 'a', capturedAt: Infinity }] }).digest[0].capturedAt).toBe(0);
    expect(normalizeSummaryBuffer({ digest: [{ id: 'b', capturedAt: NaN }] }).digest[0].capturedAt).toBe(0);
  });
});
