import {
  executeShortcut,
  executeShortcutAction,
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
      const action: ShortcutAction = {
        id: 'a1',
        type: 'setFocusMode',
        label: 'Set Focus mode to Work',
        payload: { mode: 'work' },
      };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).toHaveBeenCalledWith('work');
      expect(result).toEqual({ status: 'ok', type: 'setFocusMode' });
    });

    it('is a no-op when the mode payload is missing', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = { id: 'a1', type: 'setFocusMode', label: 'x' };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'noop', type: 'setFocusMode' });
    });

    it('is a no-op when the mode payload is an empty string', async () => {
      const deps = makeDeps();
      const action: ShortcutAction = {
        id: 'a1',
        type: 'setFocusMode',
        label: 'x',
        payload: { mode: '' },
      };

      const result = await executeShortcutAction(action, deps);

      expect(deps.setFocusMode).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'noop', type: 'setFocusMode' });
    });

    it('is a no-op for an unknown action type instead of throwing', async () => {
      const deps = makeDeps();
      const action = { id: 'a1', type: 'toggleWifi', label: 'x' } as unknown as ShortcutAction;

      const result = await executeShortcutAction(action, deps);

      expect(result).toEqual({ status: 'noop', type: 'unknown' });
    });

    it('returns status error and does not throw when the dependency rejects', async () => {
      const deps = makeDeps({
        setFocusMode: jest.fn(() => Promise.reject(new Error('boom'))),
      });
      const action: ShortcutAction = {
        id: 'a1',
        type: 'setFocusMode',
        label: 'x',
        payload: { mode: 'work' },
      };

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
        actions: [
          { id: 'a1', type: 'setFocusMode', label: 'on', payload: { mode: 'work' } },
          { id: 'a2', type: 'setFocusMode', label: 'off', payload: { mode: 'off' } },
        ],
      };

      const results = await executeShortcut(shortcut, deps);

      expect(calls).toEqual(['work', 'off']);
      expect(results).toEqual([
        { status: 'ok', type: 'setFocusMode' },
        { status: 'ok', type: 'setFocusMode' },
      ]);
    });

    it('returns an empty array for a shortcut with no actions', async () => {
      const deps = makeDeps();
      const shortcut: Shortcut = { id: 's1', name: 'Empty', actions: [] };

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
});
