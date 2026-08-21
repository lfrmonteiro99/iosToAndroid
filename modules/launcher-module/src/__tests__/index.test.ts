/**
 * Tests for the speech-recognition bridge added in issue #260.
 *
 * The repo's jest.config.js maps `modules/launcher-module/src*` to a static
 * mock (src/__mocks__/launcherModule.js), so a top-level `import` of the real
 * module would silently load the mock. `jest.requireActual('../index')` bypasses
 * that mapper and returns the REAL wrapper — confirmed experimentally — which is
 * what these tests exercise. The Kotlin implementation itself is not
 * unit-testable in this Jest setup and is out of scope here, as the issue states.
 */
import type { LauncherModuleType } from '../index';

// Mutable, `mock`-prefixed so jest allows it inside the factory.
const mockNative: {
  addListener: jest.Mock;
  startSpeechRecognition?: jest.Mock;
  stopSpeechRecognition?: jest.Mock;
  isSpeechRecognitionAvailable?: jest.Mock;
} = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const mockOs = { value: 'android' };

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => mockNative),
}));

// Override Platform.OS so we can drive BOTH the Android bridged path and the
// non-Android stub path from the same file. A getter makes `Platform.OS` read
// the current `mockOs.value` lazily at module-eval time (index.ts captures
// `isAndroid` at top level), so flipping it between describe blocks works.
// We mock only what index.ts touches (Platform.OS) to avoid pulling in RN
// TurboModules (DevMenu) which are absent in the Jest environment.
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOs.value;
    },
  },
}));

interface SpeechExports {
  default: LauncherModuleType;
  addSpeechResultListener: (listener: (text: string) => void) => () => void;
  addSpeechErrorListener: (listener: (error: string) => void) => () => void;
  reportBridgeError: (method: string, error: unknown) => void;
  onBridgeError: (listener: (method: string, error: unknown) => void) => () => void;
}

function loadModule(): SpeechExports {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.requireActual('../index') as any as SpeechExports;
}

describe('LauncherModule speech recognition — Android bridged path', () => {
  let LauncherModule: LauncherModuleType;
  let exports: SpeechExports;

  beforeEach(() => {
    mockOs.value = 'android';
    mockNative.addListener = jest.fn(() => ({ remove: jest.fn() }));
    mockNative.startSpeechRecognition = jest.fn(() => Promise.resolve(true));
    mockNative.stopSpeechRecognition = jest.fn(() => Promise.resolve(true));
    mockNative.isSpeechRecognitionAvailable = jest.fn(() => Promise.resolve(true));
    exports = loadModule();
    LauncherModule = exports.default;
  });

  it('startSpeechRecognition resolves the native result on success', async () => {
    mockNative.startSpeechRecognition = jest.fn(() => Promise.resolve(true));
    await expect(LauncherModule.startSpeechRecognition()).resolves.toBe(true);
  });

  it('isSpeechRecognitionAvailable resolves the native result on success', async () => {
    mockNative.isSpeechRecognitionAvailable = jest.fn(() => Promise.resolve(false));
    await expect(LauncherModule.isSpeechRecognitionAvailable()).resolves.toBe(false);
  });

  it('stopSpeechRecognition resolves the native result on success', async () => {
    await expect(LauncherModule.stopSpeechRecognition()).resolves.toBe(true);
  });

  it('startSpeechRecognition catches native rejection, reports it, returns false', async () => {
    const boom = new Error('native start failed');
    mockNative.startSpeechRecognition = jest.fn(() => Promise.reject(boom));
    const reported: Array<{ method: string; error: unknown }> = [];
    const off = exports.onBridgeError((method, error) => reported.push({ method, error }));

    const result = await LauncherModule.startSpeechRecognition();

    expect(result).toBe(false);
    expect(reported).toEqual([{ method: 'startSpeechRecognition', error: boom }]);
    off();
  });

  it('isSpeechRecognitionAvailable catches native rejection, reports it, returns false', async () => {
    const boom = new Error('native availability failed');
    mockNative.isSpeechRecognitionAvailable = jest.fn(() => Promise.reject(boom));
    const reported: Array<{ method: string; error: unknown }> = [];
    const off = exports.onBridgeError((method, error) => reported.push({ method, error }));

    const result = await LauncherModule.isSpeechRecognitionAvailable();

    expect(result).toBe(false);
    expect(reported).toEqual([{ method: 'isSpeechRecognitionAvailable', error: boom }]);
    off();
  });

  it('stopSpeechRecognition catches native rejection, reports it, returns false', async () => {
    const boom = new Error('native stop failed');
    mockNative.stopSpeechRecognition = jest.fn(() => Promise.reject(boom));
    const reported: Array<{ method: string; error: unknown }> = [];
    const off = exports.onBridgeError((method, error) => reported.push({ method, error }));

    const result = await LauncherModule.stopSpeechRecognition();

    expect(result).toBe(false);
    expect(reported).toEqual([{ method: 'stopSpeechRecognition', error: boom }]);
    off();
  });

  it('addSpeechResultListener forwards the native onSpeechResult payload to the JS listener', () => {
    const handler = jest.fn();
    // Capture the handler the wrapper registers on the native emitter.
    const registered = jest.fn(() => ({ remove: jest.fn() }));
    mockNative.addListener = registered;

    exports.addSpeechResultListener(handler);
    expect(registered).toHaveBeenCalledWith('onSpeechResult', expect.any(Function));

    const nativeHandler = (registered.mock.calls[0] as unknown[])[1] as (n: { text: string }) => void;
    nativeHandler({ text: 'hello world' });
    expect(handler).toHaveBeenCalledWith('hello world');
  });

  it('addSpeechErrorListener forwards the native onSpeechError payload to the JS listener', () => {
    const handler = jest.fn();
    const registered = jest.fn(() => ({ remove: jest.fn() }));
    mockNative.addListener = registered;

    exports.addSpeechErrorListener(handler);
    expect(registered).toHaveBeenCalledWith('onSpeechError', expect.any(Function));

    const nativeHandler = (registered.mock.calls[0] as unknown[])[1] as (n: { error: string }) => void;
    nativeHandler({ error: 'ERROR_AUDIO' });
    expect(handler).toHaveBeenCalledWith('ERROR_AUDIO');
  });

  it('addSpeechResultListener returns an unsubscribe fn that removes the native subscription', () => {
    const remove = jest.fn();
    mockNative.addListener = jest.fn(() => ({ remove }));

    const unsubscribe = exports.addSpeechResultListener(jest.fn());
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('LauncherModule speech recognition — non-Android stub path', () => {
  let LauncherModule: LauncherModuleType;
  let exports: SpeechExports;

  beforeEach(() => {
    mockOs.value = 'ios';
    mockNative.addListener = jest.fn(() => ({ remove: jest.fn() }));
    exports = loadModule();
    LauncherModule = exports.default;
  });

  it('startSpeechRecognition is a safe no-op returning false', async () => {
    await expect(LauncherModule.startSpeechRecognition()).resolves.toBe(false);
  });

  it('isSpeechRecognitionAvailable returns false on non-Android', async () => {
    await expect(LauncherModule.isSpeechRecognitionAvailable()).resolves.toBe(false);
  });

  it('stopSpeechRecognition is a safe no-op returning false', async () => {
    await expect(LauncherModule.stopSpeechRecognition()).resolves.toBe(false);
  });

  it('addSpeechResultListener returns an unsubscribe function without throwing', () => {
    const unsubscribe = exports.addSpeechResultListener(jest.fn());
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('addSpeechErrorListener returns an unsubscribe function without throwing', () => {
    const unsubscribe = exports.addSpeechErrorListener(jest.fn());
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
