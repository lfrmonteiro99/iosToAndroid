import {
  normalizeBackTap,
  normalizeBackTapAssignment,
  executeBackTap,
  BACK_TAP_ACTION_IDS,
  type BackTapDeps,
  type BackTapAssignment,
} from '../backTap';

/**
 * Back Tap (#773): tabela de dispatch das 8 acções.
 *
 * Exercita as funções exportadas REAIS (`normalizeBackTap*` e `executeBackTap`)
 * — nada é reimplementado aqui. As acções novas são `openCamera`,
 * `startRecording` e `sendMessage`; as antigas (flash/toggleWifi/openApp/
 * shortcut/screenshot) continuam a reutilizar as bridges existentes.
 */

const NONE: BackTapAssignment = { action: 'none' };

type Calls = Record<string, unknown[]>;

function makeDeps(overrides: Partial<BackTapDeps> = {}): BackTapDeps & { calls: Calls } {
  const calls: Calls = {
    launchApp: [],
    setFlashlight: [],
    getWifiEnabled: [],
    setWifiEnabled: [],
    isFlashlightOn: [],
    screenshot: [],
    openShortcut: [],
    openCamera: [],
    startRecording: [],
    sendMessage: [],
  };
  return {
    calls,
    launchApp: (pkg: string) => { calls.launchApp.push(pkg); return true; },
    setFlashlight: (on: boolean) => { calls.setFlashlight.push(on); return true; },
    getWifiEnabled: () => { calls.getWifiEnabled.push(null); return true; },
    setWifiEnabled: (on: boolean) => { calls.setWifiEnabled.push(on); return true; },
    isFlashlightOn: () => { calls.isFlashlightOn.push(null); return false; },
    screenshot: () => { calls.screenshot.push(null); return 'granted' as const; },
    openShortcut: (id: string) => { calls.openShortcut.push(id); },
    openCamera: () => { calls.openCamera.push(null); },
    startRecording: () => { calls.startRecording.push(null); return 'granted' as const; },
    sendMessage: (address: string, body: string) => { calls.sendMessage.push([address, body]); },
    ...overrides,
  } as BackTapDeps & { calls: Calls };
}

describe('tabela de acções (#773)', () => {
  it('expõe exactamente as 8 acções do issue mais none', () => {
    expect([...BACK_TAP_ACTION_IDS].sort()).toEqual([
      'flash',
      'none',
      'openApp',
      'openCamera',
      'screenshot',
      'sendMessage',
      'shortcut',
      'startRecording',
      'toggleWifi',
    ]);
  });
});

describe('normalize das acções novas', () => {
  it('openCamera e startRecording não precisam de alvo e sobrevivem à normalização', () => {
    expect(normalizeBackTapAssignment({ action: 'openCamera' })).toEqual({ action: 'openCamera' });
    expect(normalizeBackTapAssignment({ action: 'startRecording' })).toEqual({ action: 'startRecording' });
  });

  it('sendMessage exige destinatário: sem smsAddress degrada para none', () => {
    expect(normalizeBackTapAssignment({ action: 'sendMessage' })).toEqual(NONE);
    expect(normalizeBackTapAssignment({ action: 'sendMessage', smsAddress: '   ' })).toEqual(NONE);
  });

  it('sendMessage com destinatário mantém address e body (body vazio é permitido)', () => {
    expect(normalizeBackTapAssignment({ action: 'sendMessage', smsAddress: '+351911111111' }))
      .toEqual({ action: 'sendMessage', smsAddress: '+351911111111', smsBody: '' });
    expect(normalizeBackTapAssignment({ action: 'sendMessage', smsAddress: '911', smsBody: 'A caminho' }))
      .toEqual({ action: 'sendMessage', smsAddress: '911', smsBody: 'A caminho' });
  });

  it('sendMessage com body não-string cai para string vazia em vez de propagar lixo', () => {
    expect(normalizeBackTapAssignment({ action: 'sendMessage', smsAddress: '911', smsBody: 42 }))
      .toEqual({ action: 'sendMessage', smsAddress: '911', smsBody: '' });
  });

  it('a config completa aceita as acções novas nos dois gestos', () => {
    const out = normalizeBackTap({
      enabled: true,
      double: { action: 'openCamera' },
      triple: { action: 'startRecording' },
    });
    expect(out.double).toEqual({ action: 'openCamera' });
    expect(out.triple).toEqual({ action: 'startRecording' });
  });
});

describe('executeBackTap — acções novas', () => {
  it('openCamera chama a dep de câmara e mais nenhuma', async () => {
    const deps = makeDeps();
    const result = await executeBackTap({ action: 'openCamera' }, deps);
    expect(deps.calls.openCamera).toHaveLength(1);
    expect(deps.calls.launchApp).toHaveLength(0);
    expect(result).toEqual({ status: 'ok', action: 'openCamera' });
  });

  it('startRecording com consentimento concedido devolve ok', async () => {
    const deps = makeDeps();
    const result = await executeBackTap({ action: 'startRecording' }, deps);
    expect(deps.calls.startRecording).toHaveLength(1);
    expect(result).toEqual({ status: 'ok', action: 'startRecording' });
  });

  it('sendMessage passa destinatário e texto para a dep', async () => {
    const deps = makeDeps();
    const result = await executeBackTap(
      { action: 'sendMessage', smsAddress: '+351911111111', smsBody: 'A caminho' },
      deps,
    );
    expect(deps.calls.sendMessage).toEqual([['+351911111111', 'A caminho']]);
    expect(result).toEqual({ status: 'ok', action: 'sendMessage' });
  });

  it('sendMessage sem destinatário é no-op (não abre um smsto: partido)', async () => {
    const deps = makeDeps();
    const result = await executeBackTap({ action: 'sendMessage', smsBody: 'olá' }, deps);
    expect(deps.calls.sendMessage).toHaveLength(0);
    expect(result).toEqual({ status: 'noop', action: 'sendMessage' });
  });
});

describe('executeBackTap — consentimento e falhas', () => {
  it('screenshot com consentimento recusado devolve denied sem lançar', async () => {
    const deps = makeDeps({ screenshot: async () => 'denied' as const });
    await expect(executeBackTap({ action: 'screenshot' }, deps)).resolves.toEqual({
      status: 'denied',
      action: 'screenshot',
    });
  });

  it('startRecording com consentimento recusado devolve denied sem lançar', async () => {
    const deps = makeDeps({ startRecording: async () => 'denied' as const });
    await expect(executeBackTap({ action: 'startRecording' }, deps)).resolves.toEqual({
      status: 'denied',
      action: 'startRecording',
    });
  });

  it('screenshot indisponível (sem MediaProjection) devolve unavailable', async () => {
    const deps = makeDeps({ screenshot: async () => 'unavailable' as const });
    await expect(executeBackTap({ action: 'screenshot' }, deps)).resolves.toEqual({
      status: 'unavailable',
      action: 'screenshot',
    });
  });

  it('uma bridge que rebenta devolve error em vez de propagar a excepção', async () => {
    const deps = makeDeps({ setFlashlight: () => { throw new Error('sem lanterna'); } });
    await expect(executeBackTap({ action: 'flash' }, deps)).resolves.toEqual({
      status: 'error',
      action: 'flash',
    });
  });

  it('none e acção desconhecida devolvem noop sem tocar em bridges', async () => {
    const deps = makeDeps();
    expect(await executeBackTap(NONE, deps)).toEqual({ status: 'noop', action: 'none' });
    // @ts-expect-error acção inválida propositada
    expect(await executeBackTap({ action: 'selfDestruct' }, deps)).toEqual({ status: 'noop', action: 'none' });
    expect(deps.calls.openCamera).toHaveLength(0);
    expect(deps.calls.sendMessage).toHaveLength(0);
  });

  it('duplo disparo seguido da mesma acção chama a bridge duas vezes (sem estado preso)', async () => {
    const deps = makeDeps();
    await executeBackTap({ action: 'openCamera' }, deps);
    await executeBackTap({ action: 'openCamera' }, deps);
    expect(deps.calls.openCamera).toHaveLength(2);
  });
});
