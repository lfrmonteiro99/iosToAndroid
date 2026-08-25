import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, act } from '../../test-utils';
import {
  SMART_STACK_KEY,
  SMART_STACK_MIN,
  SMART_STACK_MAX,
  loadSmartStackConfig,
  saveSmartStackConfig,
  useSmartStackConfig,
  type WidgetType,
} from '../TodayWidgets';

const asMock = AsyncStorage.getItem as jest.Mock;
const setMock = AsyncStorage.setItem as jest.Mock;

afterEach(() => {
  jest.restoreAllMocks();
  asMock.mockReset();
  setMock.mockReset();
});

describe('smart stack config persistence (AsyncStorage)', () => {
  it('exposes the 2..4 cardinality bounds the issue requires', () => {
    expect(SMART_STACK_MIN).toBe(2);
    expect(SMART_STACK_MAX).toBe(4);
  });

  it('defaults to an empty (off) stack when nothing is stored', async () => {
    asMock.mockResolvedValue(null);
    const cfg = await loadSmartStackConfig();
    expect(cfg).toEqual([]);
  });

  it('round-trips a saved stack order through AsyncStorage', async () => {
    const saved: WidgetType[] = ['battery', 'storage', 'messages'];
    asMock.mockResolvedValue(JSON.stringify(saved));
    const cfg = await loadSmartStackConfig();
    expect(cfg).toEqual(saved);
  });

  it('drops unknown widget types instead of persisting garbage', async () => {
    asMock.mockResolvedValue(JSON.stringify(['battery', 'bogus', 'messages']));
    const cfg = await loadSmartStackConfig();
    expect(cfg).toEqual(['battery', 'messages']);
  });

  it('persists a stack order via saveSmartStackConfig under the dedicated key', async () => {
    setMock.mockResolvedValue(undefined);
    const saved: WidgetType[] = ['battery', 'screenTime'];
    await saveSmartStackConfig(saved);
    expect(setMock).toHaveBeenCalledWith(SMART_STACK_KEY, JSON.stringify(saved));
  });

  it('useSmartStackConfig loads, then persists every change it is handed', async () => {
    setMock.mockResolvedValue(undefined);
    asMock.mockImplementation((key: string) =>
      key === SMART_STACK_KEY ? Promise.resolve(JSON.stringify(['battery', 'storage'])) : Promise.resolve(null),
    );

    let captured: ReturnType<typeof useSmartStackConfig> | null = null;
    function Probe() {
      captured = useSmartStackConfig();
      return null;
    }
    render(<Probe />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(captured!.stack).toEqual(['battery', 'storage']);
    expect(captured!.loaded).toBe(true);

    // Changing the stack persists to AsyncStorage.
    await act(async () => {
      captured!.setStack(['battery', 'storage', 'messages']);
    });
    expect(setMock).toHaveBeenCalledWith(
      SMART_STACK_KEY,
      JSON.stringify(['battery', 'storage', 'messages']),
    );
    expect(captured!.stack).toEqual(['battery', 'storage', 'messages']);
  });
});
