import { dispatchLaunchApp, dispatchSetFocusMode, dispatchSendMessage, type LaunchAppDeps, type SendMessageDeps } from '../primitiveDispatcher';

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

function makeSendDeps(overrides: Partial<SendMessageDeps> = {}): SendMessageDeps & {
  calls: Array<[string, ...unknown[]]>;
} {
  const calls: Array<[string, ...unknown[]]> = [];
  const base: SendMessageDeps = {
    isAndroid: true,
    hasSmsPermission: async () => true,
    requestSmsPermission: async () => 'granted',
    sendSmsNative: async () => true,
    onPermissionDenied: () => {},
    onSent: () => {},
    onError: () => {},
  };
  const merged = { ...base, ...overrides };
  return {
    isAndroid: merged.isAndroid,
    // Every dep call records into `calls`, even when a test overrides the
    // underlying behaviour (return value or throw) — otherwise an override
    // silently drops its call from the recorded sequence and tests can't
    // assert what actually ran.
    hasSmsPermission: async () => {
      const result = await merged.hasSmsPermission();
      calls.push(['hasSmsPermission']);
      return result;
    },
    requestSmsPermission: async () => {
      const result = await merged.requestSmsPermission();
      calls.push(['requestSmsPermission']);
      return result;
    },
    sendSmsNative: async (to: string, text: string) => {
      const result = await merged.sendSmsNative(to, text);
      calls.push(['sendSmsNative', to, text]);
      return result;
    },
    onPermissionDenied: (neverAskAgain: boolean) => {
      merged.onPermissionDenied(neverAskAgain);
      calls.push(['onPermissionDenied', neverAskAgain]);
    },
    onSent: () => {
      merged.onSent();
      calls.push(['onSent']);
    },
    onError: () => {
      merged.onError();
      calls.push(['onError']);
    },
    calls,
  };
}

describe('dispatchSendMessage (#785)', () => {
  it('sends directly when permission is already granted, without requesting it again', async () => {
    const deps = makeSendDeps();
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(true);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['sendSmsNative', '+15551234567', 'hi'],
      ['onSent'],
    ]);
  });

  it('requests permission first when not already granted, then sends', async () => {
    const deps = makeSendDeps({
      hasSmsPermission: async () => false,
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(true);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['requestSmsPermission'],
      ['sendSmsNative', '+15551234567', 'hi'],
      ['onSent'],
    ]);
  });

  it('resolves false without touching native/permissions on iOS', async () => {
    const deps = makeSendDeps({ isAndroid: false });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([]);
  });

  it('surfaces permission-denied and does not send when the user denies', async () => {
    const deps = makeSendDeps({
      hasSmsPermission: async () => false,
      requestSmsPermission: async () => 'denied',
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['requestSmsPermission'],
      ['onPermissionDenied', false],
    ]);
  });

  it('flags "never ask again" separately from a plain denial', async () => {
    const deps = makeSendDeps({
      hasSmsPermission: async () => false,
      requestSmsPermission: async () => 'never_ask_again',
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['requestSmsPermission'],
      ['onPermissionDenied', true],
    ]);
  });

  it('falls through to the native send when the permission check itself throws', async () => {
    const deps = makeSendDeps({
      hasSmsPermission: async () => {
        throw new Error('bridge unavailable');
      },
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(true);
    expect(deps.calls).toEqual([
      ['sendSmsNative', '+15551234567', 'hi'],
      ['onSent'],
    ]);
  });

  it('surfaces an error and resolves false when the native send returns false', async () => {
    const deps = makeSendDeps({
      sendSmsNative: async () => false,
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['sendSmsNative', '+15551234567', 'hi'],
      ['onError'],
    ]);
  });

  it('surfaces an error and resolves false when the native send throws', async () => {
    const deps = makeSendDeps({
      sendSmsNative: async () => {
        throw new Error('bridge unavailable');
      },
    });
    const ok = await dispatchSendMessage('+15551234567', 'hi', deps);
    expect(ok).toBe(false);
    expect(deps.calls).toEqual([
      ['hasSmsPermission'],
      ['onError'],
    ]);
  });
});
