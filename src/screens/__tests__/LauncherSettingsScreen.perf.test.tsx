/**
 * #517 — os números têm de ser legíveis em runtime, sem `console.log` (que o
 * `transform-remove-console` do babel apaga em release). Este teste monta o
 * ecrã real e lê a secção Diagnostics.
 */
import React from 'react';
import { act, render } from '../../test-utils';
import { LauncherSettingsScreen, formatPerfValue } from '../LauncherSettingsScreen';
import {
  markGridVisible,
  markProcessStart,
  markWarmStartBegin,
  resetPerfMetrics,
} from '../../utils/perfMetrics';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

beforeEach(() => {
  resetPerfMetrics();
});

describe('formatPerfValue', () => {
  it('mostra o valor medido e o alvo', () => {
    expect(formatPerfValue(312, 'coldStartMs')).toBe('312 ms (alvo 400 ms)');
  });

  it.each([[null], [NaN], [Infinity]])(
    'diz "sem medição" para %p em vez de mostrar 0 ms',
    (value) => {
      expect(formatPerfValue(value as number | null, 'warmStartMs')).toBe(
        'sem medição (alvo 120 ms)',
      );
    },
  );

  it('arredonda em vez de mostrar decimais de relógio', () => {
    expect(formatPerfValue(312.6, 'coldStartMs')).toBe('313 ms (alvo 400 ms)');
  });

  it('0 ms é um valor legítimo, não "sem medição"', () => {
    expect(formatPerfValue(0, 'warmStartMs')).toBe('0 ms (alvo 120 ms)');
  });
});

describe('LauncherSettingsScreen: secção Diagnostics (#517)', () => {
  it('mostra "sem medição" quando nada foi medido ainda', () => {
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    expect(getByLabelText(/^Cold start: sem medição/)).toBeTruthy();
    expect(getByLabelText(/^Warm start: sem medição/)).toBeTruthy();
  });

  it('mostra o cold start medido', () => {
    markProcessStart(performance.now() - 150);
    markGridVisible();
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    expect(getByLabelText(/^Cold start: 1\d\d ms \(alvo 400 ms\)$/)).toBeTruthy();
  });

  it('mostra o warm start medido depois de um regresso a primeiro plano', () => {
    markProcessStart(performance.now() - 10);
    markGridVisible();
    markWarmStartBegin();
    markGridVisible();
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    expect(getByLabelText(/^Warm start: \d+ ms \(alvo 120 ms\)$/)).toBeTruthy();
  });

  it('actualiza-se quando uma medição chega com o ecrã já montado', () => {
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    expect(getByLabelText(/^Cold start: sem medição/)).toBeTruthy();
    act(() => {
      markProcessStart(performance.now() - 120);
      markGridVisible();
    });
    expect(getByLabelText(/^Cold start: 1\d\d ms/)).toBeTruthy();
  });

  it('cancela a subscrição ao desmontar — uma medição posterior não avisa nada', () => {
    const screen = render(<LauncherSettingsScreen />);
    screen.unmount();
    markProcessStart(performance.now() - 50);
    expect(() => markGridVisible()).not.toThrow();
  });
});
