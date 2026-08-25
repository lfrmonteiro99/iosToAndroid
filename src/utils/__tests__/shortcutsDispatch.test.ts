import {
  executeShortcut,
  executeShortcutAction,
  describeShortcutAction,
  type Shortcut,
  type ShortcutAction,
  type ShortcutDeps,
} from '../shortcutsDispatch';

function makeDeps(overrides: Partial<ShortcutDeps> = {}): ShortcutDeps {
  return {
    setFocusMode: jest.fn(),
    ...overrides,
  };
}

describe('shortcutsDispatch', () => {
  describe('executeShortcutAction', () => {
    it('calls setFocusMode with the payload mode for a setFocusMode action', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = { type: 'setFocusMode', payload: { mode: 'work' } };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).toHaveBeenCalledWith('work');
      expect(result).toEqual({ status: 'ok', type: 'setFocusMode' });
    });

    it('is a no-op when the mode payload is missing', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = { type: 'setFocusMode', payload: {} };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'noop', type: 'setFocusMode' });
    });

    it('is a no-op when the mode payload is an empty string', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = { type: 'setFocusMode', payload: { mode: '' } };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'noop', type: 'setFocusMode' });
    });

    it('calls the injected launchApp with the payload packageName', async () => {
      const launchApp = jest.fn();
      const deps = makeDeps({ launchApp });
      const action: ShortcutAction = { type: 'launchApp', payload: { packageName: 'com.example.app' } };

      const result = await executeShortcutAction(action, deps);

      expect(launchApp).toHaveBeenCalledWith('com.example.app');
      expect(result).toEqual({ status: 'ok', type: 'launchApp' });
    });

    it('is a no-op for launchApp when no launchApp dependency is wired', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = { type: 'launchApp', payload: { packageName: 'com.example.app' } };

      const result = await executeShortcutAction(action, deps);

      expect(result).toEqual({ status: 'noop', type: 'launchApp' });
    });

    it('is a no-op for an unknown action type instead of throwing', async () => {
      const deps = makeDeps();
      const action = { type: 'toggleWifi', payload: {} } as unknown as ShortcutAction;

      const result = await executeShortcutAction(action, deps);

      expect(result).toEqual({ status: 'noop', type: 'unknown' });
    });

    it('returns status error and does not throw when the dependency rejects', async () => {
      const deps = makeDeps({
        setFocusMode: jest.fn(() => Promise.reject(new Error('boom'))),
      });
      const action: ShortcutAction = { type: 'setFocusMode', payload: { mode: 'work' } };

      const result = await executeShortcutAction(action, deps);

      expect(result).toEqual({ status: 'error', type: 'setFocusMode' });
    });
  });

  describe('executeShortcut', () => {
    it('runs every action in order', async () => {
      const calls: string[] = [];
      const deps = makeDeps({
        setFocusMode: jest.fn((mode: string | null) => {
          calls.push(String(mode));
        }),
      });
      const shortcut: Shortcut = {
        id: 's1',
        name: 'Toggle twice',
        icon: 'bolt',
        actions: [
          { type: 'setFocusMode', payload: { mode: 'work' } },
          { type: 'setFocusMode', payload: { mode: 'off' } },
        ],
      };

      const results = await executeShortcut(shortcut, deps);

      expect(calls).toEqual(['work', 'off']);
      expect(results).toEqual([
        { status: 'ok', type: 'setFocusMode' },
        { status: 'ok', type: 'setFocusMode' },
      ]);
    });

    it('interleaves setFocusMode and launchApp in order', async () => {
      const launched: string[] = [];
      const modes: string[] = [];
      const deps = makeDeps({
        setFocusMode: jest.fn((m: string | null) => { modes.push(String(m)); }),
        launchApp: jest.fn((pkg: string) => { launched.push(pkg); }),
      });
      const shortcut: Shortcut = {
        id: 's2',
        name: 'Work then open app',
        icon: 'bolt',
        actions: [
          { type: 'setFocusMode', payload: { mode: 'work' } },
          { type: 'launchApp', payload: { packageName: 'com.example.app' } },
        ],
      };

      const results = await executeShortcut(shortcut, deps);

      expect(modes).toEqual(['work']);
      expect(launched).toEqual(['com.example.app']);
      expect(results).toEqual([
        { status: 'ok', type: 'setFocusMode' },
        { status: 'ok', type: 'launchApp' },
      ]);
    });

    it('returns an empty array for a shortcut with no actions', async () => {
      const deps = makeDeps();
      const shortcut: Shortcut = { id: 's1', name: 'Empty', icon: 'bolt', actions: [] };

      const results = await executeShortcut(shortcut, deps);

      expect(results).toEqual([]);
    });

    it('returns an empty array and does not throw for null/undefined input', async () => {
      const deps = makeDeps();

      await expect(executeShortcut(null, deps)).resolves.toEqual([]);
      await expect(executeShortcut(undefined, deps)).resolves.toEqual([]);
      expect(deps.setFocusMode).not.toHaveBeenCalled();
    });
  });

  describe('describeShortcutAction', () => {
    it('describes a setFocusMode action with its mode', () => {
      expect(describeShortcutAction({ type: 'setFocusMode', payload: { mode: 'work' } })).toBe(
        'Set Focus mode to Work',
      );
    });

    it('describes a launchApp action with its package name', () => {
      expect(
        describeShortcutAction({ type: 'launchApp', payload: { packageName: 'com.example.app' } }),
      ).toBe('Open com.example.app');
    });
  });
});
