import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletProvider, useWallet } from '../WalletStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

describe('WalletStore', () => {
  it('starts with no passes and becomes ready after load', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    expect(result.current.passes).toHaveLength(0);
    expect(result.current.isReady).toBe(true);
  });

  it('persists passes to AsyncStorage under the @iostoandroid/ key', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.addPass({
        type: 'boarding',
        title: 'TAP Lisbon-Porto',
        subtitle: 'Flight 123',
        code: 'ABC123',
        color: '#007AFF',
      });
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/wallet_passes',
      expect.stringContaining('TAP Lisbon-Porto'),
    );
  });

  it('addPass() adds a pass and generates id + createdAt', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'loyalty', title: 'Café Card', code: 'Loyal', color: '#FF9500' });
    });

    expect(result.current.passes).toHaveLength(1);
    const added = result.current.passes[0];
    expect(added.title).toBe('Café Card');
    expect(added.type).toBe('loyalty');
    expect(added.id).toBeTruthy();
    expect(added.createdAt).toBeTruthy();
  });

  it('addPass() appends without dropping existing passes', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'ticket', title: 'First', code: 'A', color: '#000' });
    });
    await act(async () => {
      result.current.addPass({ type: 'other', title: 'Second', code: 'B', color: '#111' });
    });

    expect(result.current.passes).toHaveLength(2);
    expect(result.current.passes.map((p) => p.title)).toEqual(['First', 'Second']);
  });

  it('deletePass() removes a pass from state', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'ticket', title: 'ToDelete', code: 'X', color: '#000' });
    });
    const id = result.current.passes[0].id;

    await act(async () => {
      result.current.deletePass(id);
    });

    expect(result.current.passes).toHaveLength(0);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      '@iostoandroid/wallet_passes',
      '[]',
    );
  });

  it('updatePass() merges partial updates into an existing pass', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'ticket', title: 'Original', subtitle: 'Old', code: 'ORIG', color: '#000' });
    });
    const id = result.current.passes[0].id;
    const createdAt = result.current.passes[0].createdAt;

    await act(async () => {
      result.current.updatePass(id, { title: 'Renamed', color: '#FF9500' });
    });

    expect(result.current.passes).toHaveLength(1);
    const updated = result.current.passes[0];
    expect(updated.title).toBe('Renamed');
    expect(updated.color).toBe('#FF9500');
    // Fields not passed to updatePass are untouched.
    expect(updated.subtitle).toBe('Old');
    expect(updated.code).toBe('ORIG');
    expect(updated.id).toBe(id);
    expect(updated.createdAt).toBe(createdAt);
  });

  it('updatePass() on a missing id is a no-op (does not throw, does not add a pass)', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      expect(() => result.current.updatePass('nope', { title: 'X' })).not.toThrow();
    });
    expect(result.current.passes).toHaveLength(0);
  });

  it('updatePass() only affects the targeted pass, leaving others untouched', async () => {
    // addPass() ids are Date.now().toString() — two calls in the same
    // millisecond would otherwise collide, so pin distinct timestamps.
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'ticket', title: 'First', code: 'A', color: '#000' });
    });
    await act(async () => {
      result.current.addPass({ type: 'other', title: 'Second', code: 'B', color: '#111' });
    });
    nowSpy.mockRestore();
    const secondId = result.current.passes[1].id;

    await act(async () => {
      result.current.updatePass(secondId, { title: 'Second Renamed' });
    });

    expect(result.current.passes.map((p) => p.title)).toEqual(['First', 'Second Renamed']);
  });

  it('deletePass() on a missing id is a no-op (does not throw)', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      expect(() => result.current.deletePass('nope')).not.toThrow();
    });
    expect(result.current.passes).toHaveLength(0);
  });

  it('getPass() returns the correct pass or undefined', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addPass({ type: 'boarding', title: 'Lookup', code: 'Z', color: '#222' });
    });
    const id = result.current.passes[0].id;

    expect(result.current.getPass(id)?.title).toBe('Lookup');
    expect(result.current.getPass('missing')).toBeUndefined();
  });

  it('hydrates passes from AsyncStorage on mount', async () => {
    const stored = [
      { id: 'p1', type: 'loyalty', title: 'Stored Card', code: 'STORED', color: '#FF3B30', createdAt: '2025-01-01T00:00:00Z' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    expect(result.current.passes).toHaveLength(1);
    expect(result.current.passes[0].title).toBe('Stored Card');
  });

  it('ignores malformed stored JSON instead of crashing', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not-json{');

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {});

    expect(result.current.passes).toHaveLength(0);
    expect(result.current.isReady).toBe(true);
  });
});
