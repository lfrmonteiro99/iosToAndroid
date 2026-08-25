import { dispatchLaunchApp, dispatchSetFocusMode, type LaunchAppDeps } from '../primitiveDispatcher';

function makeDeps(overrides: Partial<LaunchAppDeps> = {}): LaunchAppDeps & {
  calls: Array<[string, ...unknown[]]>;
} {
  const calls: Array<[string, ...unknown[]]> = [];
  return {
    isAndroid: true,
    isProtected: () => false,
    authenticate: async (reason: string) => {
      calls.push(['authenticate', reason]);
      return true;
    },
    launchNative: async (packageName: string) => {
      calls.push(['launchNative', packageName]);
      return true;
    },
    onLaunched: (packageName: string) => {
      calls.push(['onLaunched', packageName]);
    },
    onError: (title: string, message: string) => {
      calls.push(['onError', title, message]);
    },
    calls,
    ...overrides,
  };
}

describe('dispatchLaunchApp (#781)', () => {
  it('launches on Android and records the package into recents', async () => {
    const deps = makeDeps();
    const ok = await dispatchLaunchApp('com.example.app', deps);
    expect(ok).toBe(true);
    expect(deps.calls).toEqual([
      ['launchNative', 'com.example.app'],
      ['onLaunched', 'com.example.app'],
    ]);
  });

  it('resolves false without touching native/recents/auth on iOS (#509 parity)', async () => {
    const deps = makeDeps({ isAndroid: false });
    const ok = await dispatchLaunchApp('com.example.app', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([]);
  });

  it('gates a protected package behind biometric auth before launching', async () => {
    const deps = makeDeps({ isProtected: () => true });
    const ok = await dispatchLaunchApp('com.example.banking', deps);
    expect(ok).toBe(true);
    expect(deps.calls).toEqual([
      ['authenticate', 'Unlock app'],
      ['launchNative', 'com.example.banking'],
      ['onLaunched', 'com.example.banking'],
    ]);
  });

  it('blocks launch when biometric auth fails — fail-closed, no native call', async () => {
    const deps = makeDeps({
      isProtected: () => true,
      authenticate: async () => false,
    });
    const ok = await dispatchLaunchApp('com.example.banking', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([]);
  });

  it('surfaces an error alert and resolves false when the native launch fails', async () => {
    const deps = makeDeps();
    deps.launchNative = async (packageName: string) => {
      deps.calls.push(['launchNative', packageName]);
      return false;
    };
    const ok = await dispatchLaunchApp('com.example.missing', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['launchNative', 'com.example.missing'],
      ['onError', 'Error', 'Could not launch app. Please try again.'],
    ]);
  });

  it('surfaces an error alert and resolves false when the native call throws', async () => {
    const deps = makeDeps({
      launchNative: async () => {
        throw new Error('bridge unavailable');
      },
    });
    const ok = await dispatchLaunchApp('com.example.app', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['onError', 'Error', 'Could not launch app. Please try again.'],
    ]);
  });
});

describe('dispatchSetFocusMode (#781)', () => {
  it('applies the given mode as-is', () => {
    let applied: string | undefined;
    dispatchSetFocusMode('work', (resolved) => {
      applied = resolved;
    });
    expect(applied).toBe('work');
  });

  it('resolves null to "off" (SettingsStore.tsx parity)', () => {
    let applied: string | undefined;
    dispatchSetFocusMode(null, (resolved) => {
      applied = resolved;
    });
    expect(applied).toBe('off');
  });
});
