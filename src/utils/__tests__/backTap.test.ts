import {
  resolveBackTap,
  normalizeBackTap,
  executeBackTap,
  DEFAULT_BACK_TAP,
  type BackTapConfig,
  type BackTapDeps,
} from '../backTap';
import type { BackTapAssignment } from '../backTap';

// Back Tap (#625): mapeia double/triple tap a uma acção e dispara-a via as
// bridges nativas já existentes (flash/wifi/open-app) ou via deps injectadas
// (screenshot/shortcut). Como não há sensor de back-tap nativo neste repositório
// (e android/ está fora de alcance), o núcleo verificável é a resolução do
// mapeamento e o dispatch — exercitamos as funções exportadas reais, não
// cópias reimplementadas.

const NONE: BackTapAssignment = { action: 'none' };

function makeDeps(overrides: Partial<BackTapDeps> = {}): BackTapDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {
    launchApp: [],
    setFlashlight: [],
    getWifiEnabled: [],
    setWifiEnabled: [],
    isFlashlightOn: [],
    screenshot: [],
    openShortcut: [],
  };
  return {
    calls,
    launchApp: (pkg: string) => { calls.launchApp.push(pkg); return true; },
    setFlashlight: (on: boolean) => { calls.setFlashlight.push(on); return true; },
    getWifiEnabled: () => { calls.getWifiEnabled.push(null); return true; },
    setWifiEnabled: (on: boolean) => { calls.setWifiEnabled.push(on); return true; },
    isFlashlightOn: () => { calls.isFlashlightOn.push(null); return false; },
    screenshot: () => { calls.screenshot.push(null); },
    openShortcut: (id: string) => { calls.openShortcut.push(id); },
    ...overrides,
  } as BackTapDeps & { calls: Record<string, unknown[]> };
}

describe('normalizeBackTap', () => {
  it('devolve o default para valores que não são objectos', () => {
    expect(normalizeBackTap(undefined)).toEqual(DEFAULT_BACK_TAP);
    expect(normalizeBackTap(null)).toEqual(DEFAULT_BACK_TAP);
    expect(normalizeBackTap(42)).toEqual(DEFAULT_BACK_TAP);
    expect(normalizeBackTap('nope')).toEqual(DEFAULT_BACK_TAP);
    expect(normalizeBackTap(['double'])).toEqual(DEFAULT_BACK_TAP);
  });

  it('mantém uma configuração válida intacta', () => {
    const raw: BackTapConfig = {
      enabled: true,
      double: { action: 'flash' },
      triple: { action: 'openApp', packageName: 'com.spotify' },
    };
    expect(normalizeBackTap(raw)).toEqual(raw);
  });

  it('descarta acções desconhecidas (não presentes no union) -> none', () => {
    const raw = {
      enabled: true,
      double: { action: 'selfDestruct' },
      triple: { action: 'none' },
    };
    expect(normalizeBackTap(raw).double).toEqual(NONE);
    expect(normalizeBackTap(raw).triple).toEqual(NONE);
  });

  it('openApp/shortcut sem alvo (packageName/shortcutId) degradam para none', () => {
    const raw = {
      enabled: true,
      double: { action: 'openApp' },
      triple: { action: 'shortcut' },
    };
    expect(normalizeBackTap(raw).double).toEqual(NONE);
    expect(normalizeBackTap(raw).triple).toEqual(NONE);
  });

  it('openApp/shortcut com alvo vazio (string vazia) degradam para none', () => {
    const raw = {
      enabled: true,
      double: { action: 'openApp', packageName: '   ' },
      triple: { action: 'shortcut', shortcutId: '' },
    };
    expect(normalizeBackTap(raw).double).toEqual(NONE);
    expect(normalizeBackTap(raw).triple).toEqual(NONE);
  });

  it('enabled não-booleano é forçado para false', () => {
    const raw = { enabled: 'yes', double: { action: 'none' }, triple: { action: 'none' } };
    expect(normalizeBackTap(raw).enabled).toBe(false);
  });

  it('double e triple são independentes (só um corrompido é corrigido)', () => {
    const raw = {
      enabled: true,
      double: { action: 'flash' },
      triple: { action: 'bogus' },
    };
    const out = normalizeBackTap(raw);
    expect(out.double).toEqual({ action: 'flash' });
    expect(out.triple).toEqual(NONE);
  });
});

describe('resolveBackTap', () => {
  const config: BackTapConfig = {
    enabled: true,
    double: { action: 'flash' },
    triple: { action: 'toggleWifi' },
  };

  it("devolve a atribuição do double tap quando enabled", () => {
    expect(resolveBackTap('double', config)).toEqual({ action: 'flash' });
  });

  it("devolve a atribuição do triple tap quando enabled", () => {
    expect(resolveBackTap('triple', config)).toEqual({ action: 'toggleWifi' });
  });

  it('devolve none quando o config está desactivado', () => {
    expect(resolveBackTap('double', { ...config, enabled: false })).toEqual(NONE);
    expect(resolveBackTap('triple', { ...config, enabled: false })).toEqual(NONE);
  });

  it('devolve none para gesto desconhecido', () => {
    // gesture é 'unknown' na API; passar uma string arbitrária não é erro de
    // tipo, mas resolveBackTap só aceita 'double'/'triple' em runtime.
    expect(resolveBackTap('quad', config)).toEqual(NONE);
  });

  it('devolve none quando o config é nulo/ausente', () => {
    expect(resolveBackTap('double', null)).toEqual(NONE);
    expect(resolveBackTap('double', undefined)).toEqual(NONE);
  });

  it('é idempotente — repetir o mesmo gesto dá o mesmo resultado (duplo toque)', () => {
    const first = resolveBackTap('double', config);
    const second = resolveBackTap('double', config);
    expect(second).toEqual(first);
  });
});

describe('executeBackTap', () => {
  it('none é um no-op: não chama nenhuma bridge', async () => {
    const deps = makeDeps();
    await executeBackTap(NONE, deps);
    expect(deps.calls.launchApp).toHaveLength(0);
    expect(deps.calls.setFlashlight).toHaveLength(0);
    expect(deps.calls.setWifiEnabled).toHaveLength(0);
    expect(deps.calls.screenshot).toHaveLength(0);
    expect(deps.calls.openShortcut).toHaveLength(0);
  });

  it('acção desconhecida é um no-op (não dispara intent partido)', async () => {
    const deps = makeDeps();
    // @ts-expect-error acção inválida propositada
    await executeBackTap({ action: 'selfDestruct' }, deps);
    expect(deps.calls.launchApp).toHaveLength(0);
    expect(deps.calls.setFlashlight).toHaveLength(0);
  });

  it('flash faz toggle via isFlashlightOn + setFlashlight', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'flash' }, deps);
    expect(deps.calls.isFlashlightOn).toHaveLength(1);
    // isFlashlightOn devolve false -> liga (true)
    expect(deps.calls.setFlashlight).toEqual([true]);
  });

  it('toggleWifi faz toggle via getWifiEnabled + setWifiEnabled', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'toggleWifi' }, deps);
    expect(deps.calls.getWifiEnabled).toHaveLength(1);
    // wifiEnabled devolve true -> desliga (false)
    expect(deps.calls.setWifiEnabled).toEqual([false]);
  });

  it('openApp chama launchApp com o packageName', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'openApp', packageName: 'com.spotify' }, deps);
    expect(deps.calls.launchApp).toEqual(['com.spotify']);
    expect(deps.calls.setWifiEnabled).toHaveLength(0);
  });

  it('shortcut chama openShortcut com o id', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'shortcut', shortcutId: 'com.whatsapp.contact.joao' }, deps);
    expect(deps.calls.openShortcut).toEqual(['com.whatsapp.contact.joao']);
  });

  it('screenshot chama o dep screenshot', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'screenshot' }, deps);
    expect(deps.calls.screenshot).toHaveLength(1);
  });

  it('openApp sem packageName (após normalize) não chama launchApp', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'openApp' }, deps);
    expect(deps.calls.launchApp).toHaveLength(0);
  });
});
