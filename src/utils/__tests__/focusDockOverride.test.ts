import {
  normalizeFocusDockOverride,
  dockOverrideForMode,
  toggleDockOverrideApp,
  MAX_DOCK_APPS,
} from '../focusDockOverride';

// Focus dock override (#619, filho de #617) — helpers puros. Exercitam as
// funções exportadas reais (nada é reimplementado aqui): o LauncherHomeScreen
// e o FocusScreen consomem exactamente estas.

describe('normalizeFocusDockOverride', () => {
  it('devolve {} para valores que não são objectos', () => {
    expect(normalizeFocusDockOverride(undefined)).toEqual({});
    expect(normalizeFocusDockOverride(null)).toEqual({});
    expect(normalizeFocusDockOverride(42)).toEqual({});
    expect(normalizeFocusDockOverride('work')).toEqual({});
    expect(normalizeFocusDockOverride(['com.slack'])).toEqual({});
  });

  it('mantém package names válidos', () => {
    expect(normalizeFocusDockOverride({ work: ['com.slack', 'com.gmail'] })).toEqual({
      work: ['com.slack', 'com.gmail'],
    });
  });

  it('descarta modos cujo valor não é array', () => {
    expect(normalizeFocusDockOverride({ work: 'nope', sleep: ['com.calm'] })).toEqual({
      sleep: ['com.calm'],
    });
  });

  it('descarta entradas que não são string, strings vazias e duplicados', () => {
    expect(
      normalizeFocusDockOverride({ work: [1, null, '', '  ', 'com.slack', 'com.slack'] }),
    ).toEqual({ work: ['com.slack'] });
  });

  it('mantém um array vazio (significa "manter dock normal", distinto de chave ausente)', () => {
    expect(normalizeFocusDockOverride({ work: [] })).toEqual({ work: [] });
  });

  it(`corta cada lista a ${MAX_DOCK_APPS} entradas`, () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(normalizeFocusDockOverride({ work: five })).toEqual({ work: ['a', 'b', 'c', 'd'] });
  });
});

describe('dockOverrideForMode', () => {
  it("devolve null para o modo 'off' mesmo com entrada guardada", () => {
    expect(dockOverrideForMode({ off: ['com.slack'], work: ['com.gmail'] }, 'off')).toBeNull();
  });

  it('devolve null para modo desconhecido, vazio ou mapa ausente', () => {
    expect(dockOverrideForMode({ work: ['com.slack'] }, 'sleep')).toBeNull();
    expect(dockOverrideForMode({ work: ['com.slack'] }, '')).toBeNull();
    expect(dockOverrideForMode(undefined, 'work')).toBeNull();
    expect(dockOverrideForMode(null, 'work')).toBeNull();
  });

  it('devolve null quando a lista do modo activo está vazia (manter dock normal)', () => {
    expect(dockOverrideForMode({ work: [] }, 'work')).toBeNull();
  });

  it('devolve os package names do modo activo', () => {
    expect(dockOverrideForMode({ work: ['com.slack', 'com.gmail'] }, 'work')).toEqual([
      'com.slack',
      'com.gmail',
    ]);
  });
});

describe('toggleDockOverrideApp', () => {
  it('adiciona um package ausente', () => {
    expect(toggleDockOverrideApp({ work: ['com.slack'] }, 'work', 'com.gmail')).toEqual({
      work: ['com.slack', 'com.gmail'],
    });
  });

  it('remove um package já presente (duplo toque volta ao estado inicial)', () => {
    const once = toggleDockOverrideApp({}, 'work', 'com.slack');
    expect(once).toEqual({ work: ['com.slack'] });
    expect(toggleDockOverrideApp(once, 'work', 'com.slack')).toEqual({ work: [] });
  });

  it('não muta o mapa recebido', () => {
    const before = { work: ['com.slack'] };
    toggleDockOverrideApp(before, 'work', 'com.gmail');
    expect(before).toEqual({ work: ['com.slack'] });
  });

  it('não toca noutros modos', () => {
    expect(toggleDockOverrideApp({ sleep: ['com.calm'] }, 'work', 'com.slack')).toEqual({
      sleep: ['com.calm'],
      work: ['com.slack'],
    });
  });

  it(`ignora silenciosamente ao tentar adicionar o ${MAX_DOCK_APPS + 1}º app`, () => {
    const full = { work: ['a', 'b', 'c', 'd'] };
    expect(toggleDockOverrideApp(full, 'work', 'e')).toEqual(full);
  });

  it('remover um app quando a lista está no limite volta a permitir adicionar', () => {
    const full = { work: ['a', 'b', 'c', 'd'] };
    const afterRemove = toggleDockOverrideApp(full, 'work', 'a');
    expect(afterRemove).toEqual({ work: ['b', 'c', 'd'] });
    expect(toggleDockOverrideApp(afterRemove, 'work', 'e')).toEqual({ work: ['b', 'c', 'd', 'e'] });
  });
});
