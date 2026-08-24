import {
  PRIMITIVE_ACTIONS,
  validateAction,
  runActions,
  type ActionContext,
  type PrimitiveAction,
  type ActionResult,
} from '../actions';

// A context whose every method records the call and resolves/rejects on demand.
function makeContext(opts: {
  launchApp?: (pkg: string) => boolean | Promise<boolean>;
  sendMessage?: (addr: string, body: string) => boolean | Promise<boolean>;
  startTimer?: (secs: number) => void | Promise<void>;
  setDnd?: (enabled: boolean, mode?: string) => void;
  openDeepLink?: (uri: string) => boolean | Promise<boolean>;
} = {}): ActionContext & { calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = [];
  return {
    calls,
    launchApp: (pkg: string) => {
      calls.push(['launchApp', pkg]);
      return opts.launchApp ? opts.launchApp(pkg) : true;
    },
    sendMessage: (addr: string, body: string) => {
      calls.push(['sendMessage', addr, body]);
      return opts.sendMessage ? opts.sendMessage(addr, body) : true;
    },
    startTimer: (secs: number) => {
      calls.push(['startTimer', secs]);
      return opts.startTimer ? opts.startTimer(secs) : undefined;
    },
    setDnd: (enabled: boolean, mode?: string) => {
      calls.push(['setDnd', enabled, mode]);
      opts.setDnd?.(enabled, mode);
    },
    openDeepLink: (uri: string) => {
      calls.push(['openDeepLink', uri]);
      return opts.openDeepLink ? opts.openDeepLink(uri) : true;
    },
  };
}

describe('PRIMITIVE_ACTIONS catalog', () => {
  const kinds = PRIMITIVE_ACTIONS.map((a) => a.kind);

  it('lists exactly the five required primitives: openApp, sendMessage, timer, dnd, deepLink', () => {
    expect(kinds.sort()).toEqual(
      ['dnd', 'deepLink', 'openApp', 'sendMessage', 'timer'].sort(),
    );
  });

  it('gives every action a non-empty label and a declared params shape', () => {
    for (const action of PRIMITIVE_ACTIONS) {
      expect(action.label.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(action.params)).toBe(true);
      for (const p of action.params) {
        expect(['string', 'number', 'boolean']).toContain(p.type);
      }
    }
  });
});

describe('validateAction', () => {
  describe('openApp', () => {
    it('accepts a valid lowercase Android package name', () => {
      expect(validateAction({ kind: 'openApp', packageName: 'com.example.app' })).toBeNull();
    });

    it('accepts the built-in com.iostoandroid.* namespace', () => {
      expect(validateAction({ kind: 'openApp', packageName: 'com.iostoandroid.weather' })).toBeNull();
    });

    it('rejects an empty package name', () => {
      expect(validateAction({ kind: 'openApp', packageName: '' })).toMatch(/package/i);
    });

    it('rejects a malformed package name (no dot, or uppercase)', () => {
      expect(validateAction({ kind: 'openApp', packageName: 'Calculator' })).toMatch(/package/i);
      expect(validateAction({ kind: 'openApp', packageName: 'Com.Example.App' })).toMatch(/package/i);
    });

    it('rejects a non-string package name', () => {
      // @ts-expect-error - exercising the runtime guard, not the type
      expect(validateAction({ kind: 'openApp', packageName: 42 })).toMatch(/package/i);
    });
  });

  describe('sendMessage', () => {
    it('accepts a non-empty address (body may be empty)', () => {
      expect(validateAction({ kind: 'sendMessage', address: '+15551234567', body: '' })).toBeNull();
    });

    it('rejects a missing/empty address', () => {
      expect(validateAction({ kind: 'sendMessage', address: '', body: 'hi' })).toMatch(/address/i);
    });
  });

  describe('timer', () => {
    it('accepts a one-second timer (lower boundary)', () => {
      expect(validateAction({ kind: 'timer', seconds: 1 })).toBeNull();
    });

    it('accepts the upper boundary of one day', () => {
      expect(validateAction({ kind: 'timer', seconds: 86400 })).toBeNull();
    });

    it('rejects zero and negative durations', () => {
      expect(validateAction({ kind: 'timer', seconds: 0 })).toMatch(/timer|second/i);
      expect(validateAction({ kind: 'timer', seconds: -5 })).toMatch(/timer|second/i);
    });

    it('rejects a duration above one day', () => {
      expect(validateAction({ kind: 'timer', seconds: 86401 })).toMatch(/timer|second/i);
    });

    it('rejects a non-integer duration', () => {
      expect(validateAction({ kind: 'timer', seconds: 30.5 })).toMatch(/integer|timer/i);
    });
  });

  describe('dnd', () => {
    it('accepts enabled without an explicit mode (defaults to doNotDisturb at run time)', () => {
      expect(validateAction({ kind: 'dnd', enabled: true })).toBeNull();
    });

    it('accepts a known mode', () => {
      expect(validateAction({ kind: 'dnd', enabled: true, mode: 'work' })).toBeNull();
    });

    it('rejects an unknown mode', () => {
      // @ts-expect-error - runtime guard for an invalid enum value
      expect(validateAction({ kind: 'dnd', enabled: true, mode: 'airplane' })).toMatch(/mode/i);
    });

    it('accepts disabled regardless of mode', () => {
      expect(validateAction({ kind: 'dnd', enabled: false, mode: 'sleep' })).toBeNull();
    });
  });

  describe('deepLink', () => {
    it('accepts an http(s) URL', () => {
      expect(validateAction({ kind: 'deepLink', uri: 'https://example.com/path' })).toBeNull();
    });

    it('accepts a custom-scheme URI', () => {
      expect(validateAction({ kind: 'deepLink', uri: 'myapp://open/settings' })).toBeNull();
    });

    it('rejects a URI with no scheme separator', () => {
      expect(validateAction({ kind: 'deepLink', uri: 'not a link' })).toMatch(/uri|scheme/i);
    });

    it('rejects an empty URI', () => {
      expect(validateAction({ kind: 'deepLink', uri: '' })).toMatch(/uri|scheme/i);
    });
  });
});

describe('runActions (sequential runner)', () => {
  it('runs actions one after another in input order', async () => {
    const ctx = makeContext();
    const actions: PrimitiveAction[] = [
      { kind: 'openApp', packageName: 'com.example.a' },
      { kind: 'dnd', enabled: true },
      { kind: 'timer', seconds: 60 },
    ];

    const results = await runActions(actions, ctx);

    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(ctx.calls.map((c) => c[0])).toEqual(['launchApp', 'setDnd', 'startTimer']);
  });

  it('dispatches each action to the matching context method with the right arguments', async () => {
    const ctx = makeContext();
    const actions: PrimitiveAction[] = [
      { kind: 'sendMessage', address: '+1555', body: 'hi' },
      { kind: 'deepLink', uri: 'myapp://x' },
    ];

    await runActions(actions, ctx);

    expect(ctx.calls).toEqual([
      ['sendMessage', '+1555', 'hi'],
      ['openDeepLink', 'myapp://x'],
    ]);
  });

  it('defaults dnd to doNotDisturb when no mode is supplied', async () => {
    const ctx = makeContext();
    await runActions([{ kind: 'dnd', enabled: true }], ctx);
    expect(ctx.calls[0]).toEqual(['setDnd', true, 'doNotDisturb']);
  });

  it('passes an explicit dnd mode through unchanged', async () => {
    const ctx = makeContext();
    await runActions([{ kind: 'dnd', enabled: true, mode: 'work' }], ctx);
    expect(ctx.calls[0]).toEqual(['setDnd', true, 'work']);
  });

  it('never calls the context for an invalid action, and reports the failure', async () => {
    const ctx = makeContext();
    // packageName "" is invalid
    const results = await runActions([{ kind: 'openApp', packageName: '' }], ctx);

    expect(ctx.calls).toHaveLength(0);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/package/i);
  });

  it('continues to a valid action after a preceding one fails validation (never reaches the context)', async () => {
    const ctx = makeContext();
    const actions: PrimitiveAction[] = [
      { kind: 'openApp', packageName: '' }, // invalid: fails validateAction, never touches ctx
      { kind: 'timer', seconds: 10 }, // must still run
    ];

    const results = await runActions(actions, ctx);

    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/package/i);
    expect(results[1].ok).toBe(true);
    // Only the valid action reaches the context; the invalid one is skipped, not aborted.
    expect(ctx.calls).toEqual([['startTimer', 10]]);
  });

  it('records a failure when the context method rejects, but still runs the remaining actions', async () => {
    const ctx = makeContext({
      launchApp: () => false, // rejected launch
    });
    const actions: PrimitiveAction[] = [
      { kind: 'openApp', packageName: 'com.example.missing' }, // fails
      { kind: 'timer', seconds: 10 }, // still runs
    ];

    const results = await runActions(actions, ctx);

    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
    // The timer after the failed openApp was still executed.
    expect(ctx.calls.map((c) => c[0])).toEqual(['launchApp', 'startTimer']);
  });

  it('isolates a thrown exception from one action so it does not abort the runner', async () => {
    const ctx = makeContext({
      openDeepLink: () => {
        throw new Error('no handler');
      },
    });
    const actions: PrimitiveAction[] = [
      { kind: 'deepLink', uri: 'bad://x' },
      { kind: 'dnd', enabled: false },
    ];

    const results = await runActions(actions, ctx);

    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/no handler/);
    expect(results[1].ok).toBe(true);
  });

  it('returns an empty result list for an empty action list', async () => {
    const ctx = makeContext();
    const results: ActionResult[] = await runActions([], ctx);
    expect(results).toEqual([]);
    expect(ctx.calls).toHaveLength(0);
  });

  it('awaits asynchronous context methods before starting the next action', async () => {
    const order: string[] = [];
    const ctx = makeContext({
      async launchApp(pkg: string) {
        order.push(`start:${pkg}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end:${pkg}`);
        return true;
      },
      async startTimer(secs: number) {
        order.push(`timer:${secs}`);
      },
    });
    await runActions(
      [
        { kind: 'openApp', packageName: 'com.example.a' },
        { kind: 'timer', seconds: 5 },
      ],
      ctx,
    );
    expect(order).toEqual(['start:com.example.a', 'end:com.example.a', 'timer:5']);
  });
});
