import {
  DEFAULT_REQUIRE_PASSCODE_AFTER,
  REQUIRE_PASSCODE_DELAY_MS,
  REQUIRE_PASSCODE_LABELS,
  REQUIRE_PASSCODE_OPTIONS,
  isPasscodeRequired,
  normalizeRequirePasscodeAfter,
} from '../passcodePolicy';

// #611 — «Require Passcode after» (iOS «Face ID & Passcode → Require Passcode»).
// Estes testes chamam a função exportada real, não uma cópia da fórmula.

const MIN = 60_000;

describe('passcodePolicy — normalizeRequirePasscodeAfter', () => {
  it('aceita todas as opções expostas na UI', () => {
    for (const option of REQUIRE_PASSCODE_OPTIONS) {
      expect(normalizeRequirePasscodeAfter(option)).toBe(option);
    }
  });

  it('cai no default para valores ausentes, corrompidos ou de outro tipo', () => {
    for (const bad of [undefined, null, '', '10min', 'IMMEDIATELY', 5, {}, []]) {
      expect(normalizeRequirePasscodeAfter(bad)).toBe(DEFAULT_REQUIRE_PASSCODE_AFTER);
    }
  });

  it('tem um rótulo e uma tolerância para cada opção, sem sobras', () => {
    expect(Object.keys(REQUIRE_PASSCODE_DELAY_MS).sort()).toEqual([...REQUIRE_PASSCODE_OPTIONS].sort());
    expect(Object.keys(REQUIRE_PASSCODE_LABELS).sort()).toEqual([...REQUIRE_PASSCODE_OPTIONS].sort());
  });
});

describe('passcodePolicy — isPasscodeRequired', () => {
  it("'immediately' exige sempre, mesmo com um desbloqueio há um instante", () => {
    expect(isPasscodeRequired('immediately', 1_000_000, 1_000_001)).toBe(true);
    expect(isPasscodeRequired('immediately', 1_000_000, 1_000_000)).toBe(true);
  });

  it('não exige dentro do intervalo escolhido', () => {
    const last = 1_000_000;
    expect(isPasscodeRequired('5min', last, last + 4 * MIN)).toBe(false);
    expect(isPasscodeRequired('1hour', last, last + 59 * MIN)).toBe(false);
    expect(isPasscodeRequired('4hours', last, last + 239 * MIN)).toBe(false);
  });

  it('exige exactamente no limite e depois dele (limite, limite ±1ms)', () => {
    const last = 1_000_000;
    expect(isPasscodeRequired('5min', last, last + 5 * MIN - 1)).toBe(false);
    expect(isPasscodeRequired('5min', last, last + 5 * MIN)).toBe(true);
    expect(isPasscodeRequired('5min', last, last + 5 * MIN + 1)).toBe(true);
  });

  it('exige quando nunca houve desbloqueio (arranque a frio)', () => {
    expect(isPasscodeRequired('4hours', null, 1_000_000)).toBe(true);
    expect(isPasscodeRequired('4hours', Number.NaN, 1_000_000)).toBe(true);
  });

  it('exige quando o relógio andou para trás (elapsed negativo)', () => {
    expect(isPasscodeRequired('4hours', 2_000_000, 1_000_000)).toBe(true);
  });

  it('exige com uma opção inválida — o default é o mais restritivo', () => {
    const last = 1_000_000;
    expect(isPasscodeRequired('42years', last, last + 1)).toBe(true);
    expect(isPasscodeRequired(undefined, last, last + 1)).toBe(true);
  });

  it('trata valores de tempo absurdamente grandes sem deixar de exigir', () => {
    expect(isPasscodeRequired('4hours', 0, Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
