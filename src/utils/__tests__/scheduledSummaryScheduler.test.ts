import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  slotsForScheduledSummaryIdx,
  dueScheduledSummarySlots,
  createScheduledSummaryTracker,
  buildScheduledSummaryBanner,
  runScheduledSummaryCheck,
} from '../scheduledSummaryScheduler';
import { captureBatched } from '../scheduledSummaryBuffer';

describe('slotsForScheduledSummaryIdx', () => {
  it('0 = Off: nenhum slot', () => {
    expect(slotsForScheduledSummaryIdx(0)).toEqual([]);
  });
  it('1 = Morning', () => {
    expect(slotsForScheduledSummaryIdx(1)).toEqual(['morning']);
  });
  it('2 = Evening', () => {
    expect(slotsForScheduledSummaryIdx(2)).toEqual(['evening']);
  });
  it('3 = Both', () => {
    expect(slotsForScheduledSummaryIdx(3)).toEqual(['morning', 'evening']);
  });
  it('valor desconhecido comporta-se como Off', () => {
    expect(slotsForScheduledSummaryIdx(99)).toEqual([]);
  });
});

describe('dueScheduledSummarySlots', () => {
  it('idx=0 nunca fica devido, mesmo às 18:00', () => {
    const tracker = createScheduledSummaryTracker();
    const now = new Date(2026, 0, 1, 18, 0, 0);
    expect(dueScheduledSummarySlots(now, 0, tracker)).toEqual([]);
  });

  it('idx=2 fica devido às 18:00, não antes', () => {
    const tracker = createScheduledSummaryTracker();
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 17, 59, 0), 2, tracker)).toEqual([]);
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 18, 0, 0), 2, tracker)).toEqual(['evening']);
  });

  it('idx=2 não repete o mesmo slot no mesmo dia', () => {
    const tracker = createScheduledSummaryTracker();
    const now = new Date(2026, 0, 1, 18, 5, 0);
    expect(dueScheduledSummarySlots(now, 2, tracker)).toEqual(['evening']);
    expect(dueScheduledSummarySlots(now, 2, tracker)).toEqual([]);
  });

  it('idx=3 liberta em ambos, cada um na sua hora', () => {
    const tracker = createScheduledSummaryTracker();
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 8, 0, 0), 3, tracker)).toEqual(['morning']);
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 12, 0, 0), 3, tracker)).toEqual([]);
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 18, 0, 0), 3, tracker)).toEqual(['evening']);
  });

  it('num dia novo, o mesmo slot volta a ficar devido', () => {
    const tracker = createScheduledSummaryTracker();
    expect(dueScheduledSummarySlots(new Date(2026, 0, 1, 18, 0, 0), 2, tracker)).toEqual(['evening']);
    expect(dueScheduledSummarySlots(new Date(2026, 0, 2, 18, 0, 0), 2, tracker)).toEqual(['evening']);
  });
});

describe('buildScheduledSummaryBanner', () => {
  it('devolve null quando não havia nada capturado (count=0)', () => {
    expect(buildScheduledSummaryBanner({ slot: 'evening', count: 0, items: [] })).toBeNull();
  });

  it('devolve um banner-resumo quando há itens', () => {
    const banner = buildScheduledSummaryBanner({
      slot: 'evening',
      count: 3,
      items: [{ id: '1' }, { id: '2' }, { id: '3' }],
    });
    expect(banner).not.toBeNull();
    expect(banner?.title).toBe('Evening Summary');
    expect(banner?.body).toContain('3');
  });
});

describe('runScheduledSummaryCheck', () => {
  it('idx=2, avança até às 18:00: chama releaseBatched(evening) e setBanner com o resumo', async () => {
    const tracker = createScheduledSummaryTracker();
    const release = jest.fn().mockResolvedValue({ slot: 'evening', count: 2, items: [{ id: 'a' }, { id: 'b' }] });
    const setBanner = jest.fn();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 17, 0, 0),
      scheduledSummaryIdx: 2,
      tracker,
      releaseBatched: release,
      setBanner,
    });
    expect(release).not.toHaveBeenCalled();
    expect(setBanner).not.toHaveBeenCalled();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 18, 0, 0),
      scheduledSummaryIdx: 2,
      tracker,
      releaseBatched: release,
      setBanner,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('evening');
    expect(setBanner).toHaveBeenCalledTimes(1);
    expect(setBanner.mock.calls[0][0].title).toBe('Evening Summary');
  });

  it('idx=0: nunca chama releaseBatched, batched continuam suprimidas', async () => {
    const tracker = createScheduledSummaryTracker();
    const release = jest.fn().mockResolvedValue({ slot: 'evening', count: 5, items: [] });
    const setBanner = jest.fn();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 18, 0, 0),
      scheduledSummaryIdx: 0,
      tracker,
      releaseBatched: release,
      setBanner,
    });

    expect(release).not.toHaveBeenCalled();
    expect(setBanner).not.toHaveBeenCalled();
  });

  it('idx=3: liberta em ambos os slots ao longo do dia', async () => {
    const tracker = createScheduledSummaryTracker();
    const release = jest.fn().mockResolvedValue({ slot: 'morning', count: 1, items: [{ id: 'x' }] });
    const setBanner = jest.fn();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 8, 0, 0),
      scheduledSummaryIdx: 3,
      tracker,
      releaseBatched: release,
      setBanner,
    });
    expect(release).toHaveBeenNthCalledWith(1, 'morning');

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 18, 0, 0),
      scheduledSummaryIdx: 3,
      tracker,
      releaseBatched: release,
      setBanner,
    });
    expect(release).toHaveBeenNthCalledWith(2, 'evening');
    expect(release).toHaveBeenCalledTimes(2);
    expect(setBanner).toHaveBeenCalledTimes(2);
  });

  it('quando o release vem vazio, releaseBatched é chamado mas nenhum banner aparece', async () => {
    const tracker = createScheduledSummaryTracker();
    const release = jest.fn().mockResolvedValue({ slot: 'evening', count: 0, items: [] });
    const setBanner = jest.fn();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 18, 0, 0),
      scheduledSummaryIdx: 2,
      tracker,
      releaseBatched: release,
      setBanner,
    });

    expect(release).toHaveBeenCalledWith('evening');
    expect(setBanner).not.toHaveBeenCalled();
  });

  it('app reiniciada entre a captura e a libertação ainda liberta (buffer persistido)', async () => {
    // Simula o disco real por trás do AsyncStorage mockado: um valor que
    // sobrevive a um "restart" (jest.resetModules), ao contrário do cache em
    // memória do módulo do buffer.
    let disk: string | null = null;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.resolve(disk));
    (AsyncStorage.setItem as jest.Mock).mockImplementation((_key: string, value: string) => {
      disk = value;
      return Promise.resolve();
    });

    // Captura antes de "reiniciar" a app.
    await captureBatched({ id: 'n1', title: 'Old app', text: 'hello' });

    // "Restart": limpa a cache em memória do módulo do buffer (e do mock do
    // AsyncStorage, que ganha uma instância nova) e volta a importar — só o
    // que está persistido em `disk` sobrevive, tal como um AsyncStorage real
    // sobrevive a um restart do processo.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshAsyncStorage = require('@react-native-async-storage/async-storage').default;
    freshAsyncStorage.getItem.mockImplementation(() => Promise.resolve(disk));
    freshAsyncStorage.setItem.mockImplementation((_key: string, value: string) => {
      disk = value;
      return Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bufferAfterRestart = require('../scheduledSummaryBuffer') as typeof import('../scheduledSummaryBuffer');

    const tracker = createScheduledSummaryTracker();
    const setBanner = jest.fn();

    await runScheduledSummaryCheck({
      now: new Date(2026, 0, 1, 18, 0, 0),
      scheduledSummaryIdx: 2,
      tracker,
      releaseBatched: bufferAfterRestart.releaseBatched,
      setBanner,
    });

    expect(setBanner).toHaveBeenCalledTimes(1);
    expect(setBanner.mock.calls[0][0].body).toContain('1');

    // O buffer já foi esvaziado — uma segunda libertação não devolve nada.
    const second = await bufferAfterRestart.releaseBatched('evening');
    expect(second.count).toBe(0);
  });
});
