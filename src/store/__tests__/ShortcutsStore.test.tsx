import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShortcutsProvider, useShortcuts, ShortcutAction } from '../ShortcutsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ShortcutsProvider>{children}</ShortcutsProvider>
);

let idCounter = 1000000;

const launchAppAction: ShortcutAction = {
  type: 'launchApp',
  payload: { packageName: 'com.example.app' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockImplementation(() => ++idCounter);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ShortcutsStore', () => {
  it('starts empty and becomes ready after the async read', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    expect(result.current.shortcuts).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it('createShortcut() appends a new shortcut with generated id', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('Go home', 'house.fill', [launchAppAction]);
    });

    expect(result.current.shortcuts).toHaveLength(1);
    const shortcut = result.current.shortcuts[0];
    expect(shortcut.name).toBe('Go home');
    expect(shortcut.icon).toBe('house.fill');
    expect(shortcut.actions).toEqual([launchAppAction]);
    expect(typeof shortcut.id).toBe('string');
  });

  it('createShortcut() ignores a call with no name', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('', 'house.fill', []);
    });

    expect(result.current.shortcuts).toHaveLength(0);
  });

  it('createShortcut() persists the new shortcut to AsyncStorage', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.createShortcut('Focus work', 'bolt.fill', [
        { type: 'setFocusMode', payload: { mode: 'work' } },
      ]);
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/shortcuts',
      expect.stringContaining('Focus work'),
    );
  });

  it('updateShortcut() merges partial changes and preserves untouched fields', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('Go home', 'house.fill', [launchAppAction]);
    });
    const id = result.current.shortcuts[0].id;

    await act(async () => {
      result.current.updateShortcut(id, { name: 'Head home' });
    });

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].name).toBe('Head home');
    expect(result.current.shortcuts[0].icon).toBe('house.fill');
    expect(result.current.shortcuts[0].actions).toEqual([launchAppAction]);
  });

  it('updateShortcut() is a no-op for an unknown id', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('Go home', 'house.fill', [launchAppAction]);
    });

    await act(async () => {
      result.current.updateShortcut('does-not-exist', { name: 'Ghost' });
    });

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].name).toBe('Go home');
  });

  it('deleteShortcut() removes a shortcut by id', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('Go home', 'house.fill', [launchAppAction]);
    });
    const id = result.current.shortcuts[0].id;

    await act(async () => {
      result.current.deleteShortcut(id);
    });

    expect(result.current.shortcuts).toHaveLength(0);
  });

  it('deleteShortcut() is a no-op for an unknown id', async () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createShortcut('Keep me', 'house.fill', [launchAppAction]);
    });

    await act(async () => {
      result.current.deleteShortcut('does-not-exist');
    });

    expect(result.current.shortcuts).toHaveLength(1);
  });

  it('hydrates shortcuts from AsyncStorage on mount', async () => {
    const saved = JSON.stringify([
      {
        id: 'saved-1',
        name: 'Saved shortcut',
        icon: 'star.fill',
        actions: [launchAppAction],
      },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].name).toBe('Saved shortcut');
    expect(result.current.isReady).toBe(true);
  });

  it('a created/updated shortcut survives a reload of the store', async () => {
    const first = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      first.result.current.createShortcut('Go home', 'house.fill', [launchAppAction]);
    });
    const id = first.result.current.shortcuts[0].id;

    await act(async () => {
      first.result.current.updateShortcut(id, { name: 'Head home' });
    });

    // Simulate a reload: a fresh provider instance reads whatever was persisted.
    const persisted = (AsyncStorage.setItem as jest.Mock).mock.calls.slice(-1)[0][1];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(persisted);

    const second = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    expect(second.result.current.shortcuts).toHaveLength(1);
    expect(second.result.current.shortcuts[0].id).toBe(id);
    expect(second.result.current.shortcuts[0].name).toBe('Head home');
    expect(second.result.current.shortcuts[0].actions).toEqual([launchAppAction]);
  });

  it('ignores a corrupt (non-array) AsyncStorage payload', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('"not-an-array"');

    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    expect(result.current.shortcuts).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it('drops malformed entries (missing actions) from a stored payload', async () => {
    const saved = JSON.stringify([
      { id: 'bad-1', name: 'Bad shortcut', icon: 'star.fill' }, // no actions[]
      { id: 'good-1', name: 'Good shortcut', icon: 'star.fill', actions: [launchAppAction] },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useShortcuts(), { wrapper });
    await act(async () => {});

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].id).toBe('good-1');
  });

  it('throws when useShortcuts() is used outside its provider', () => {
    expect(() => {
      const { result } = renderHook(() => useShortcuts());
      void result.current;
    }).toThrow();
  });
});
