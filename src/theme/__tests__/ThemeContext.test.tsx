import React from 'react';
import { Text } from 'react-native';
import * as RN from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { SettingsProvider, useSettings } from '../../store/SettingsStore';

const THEME_KEY = '@iostoandroid/theme_preference';

function ThemeProbe() {
  const { isDark, isReady, mode } = useTheme();
  return <Text>{`isDark=${isDark} isReady=${isReady} mode=${mode}`}</Text>;
}

function ThemeControlProbe() {
  const { isDark, mode, setThemeMode } = useTheme();
  return (
    <>
      <Text>{`isDark=${isDark} mode=${mode}`}</Text>
      <Text onPress={() => setThemeMode('light')}>set-light</Text>
      <Text onPress={() => setThemeMode('dark')}>set-dark</Text>
      <Text onPress={() => setThemeMode('system')}>set-system</Text>
    </>
  );
}

/**
 * Renders ThemeProvider with the settings gate off (settings are not what we are
 * testing) and the theme gate on by default. The theme gate is the behaviour
 * under test: it must hold back the first render until the saved theme has
 * hydrated, so the app never paints a wrong-theme frame on launch.
 *
 * The providers are passed as the `wrapper` so `rerender` keeps the same
 * provider instances (and their state) — needed to simulate a live system-scheme
 * change without remounting the tree.
 */
function renderTheme(ui: React.ReactElement, themeGateFirstRender?: boolean) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SettingsProvider gateFirstRender={false}>
        <ThemeProvider gateFirstRender={themeGateFirstRender}>{children}</ThemeProvider>
      </SettingsProvider>
    ),
  });
}

beforeEach(() => {
  (AsyncStorage.getItem as jest.Mock).mockReset();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockClear();
  jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemeProvider launch gate (C4: no wrong-theme flash)', () => {
  it('renders nothing until the saved theme has hydrated', async () => {
    const { queryByText } = renderTheme(<ThemeProbe />);

    // Gate on: before AsyncStorage resolves, the provider returns null, so the
    // first frame can never be a time-based guess at the theme.
    expect(queryByText(/isDark=/)).toBeNull();

    await waitFor(() => expect(queryByText(/isDark=/)).toBeTruthy());
  });

  it('hydrates a saved dark override before first paint', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('dark') : Promise.resolve(null),
    );

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
    expect(getByText(/mode=dark/)).toBeTruthy();
  });

  it('hydrates a saved light override before first paint', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('light') : Promise.resolve(null),
    );

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=false/)).toBeTruthy());
    expect(getByText(/mode=light/)).toBeTruthy();
  });

  it('defers to the system scheme when no preference is saved', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('dark');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();
  });

  it('stays light on a light system scheme when no preference is saved', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('light');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=false/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();
  });

  it('does not seed isDark from the clock before hydration', async () => {
    // The old code computed the initial isDark from new Date().getHours()
    // (dark 19:00–07:00). Pin the clock to 20:00 and a light system scheme:
    // the pre-hydration render must be light, never a time-of-day guess.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(2026, 0, 1, 20, 0, 0));
      (RN.useColorScheme as jest.Mock).mockReturnValue('light');

      const { getByText } = renderTheme(<ThemeProbe />, false);

      expect(getByText(/isDark=false/)).toBeTruthy();

      // Flush the async hydration + settings sync inside act so no state
      // update lands outside act after the test ends.
      await act(async () => {});
    } finally {
      jest.useRealTimers();
    }
  });

  it('a saved dark override wins over a light system scheme', async () => {
    // The exact scenario from the issue: user opens the app at 10:00 (light
    // system scheme) with a saved dark override — the first painted theme must
    // be dark, never a light flash.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('dark') : Promise.resolve(null),
    );
    (RN.useColorScheme as jest.Mock).mockReturnValue('light');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
  });

  it('renders children immediately when the gate is off (test harness contract)', async () => {
    const { getByText } = renderTheme(<ThemeProbe />, false);

    // gateFirstRender={false} is what src/test-utils.tsx passes so synchronous
    // screen tests see the subtree instead of null.
    expect(getByText(/isDark=/)).toBeTruthy();

    // Flush the async hydration + settings sync so no state update lands
    // outside act after the test ends.
    await act(async () => {});
  });
});

describe('ThemeProvider tri-state mode (C5: system scheme, not clock)', () => {
  it('live-updates isDark when the system scheme changes while mode=system', async () => {
    // The OS scheme is not a constant: useColorScheme re-renders the provider
    // when Appearance changes. Simulate the dispatch by mutating the mock and
    // re-rendering the tree — isDark must follow the new scheme, not a cached
    // value and not the clock.
    let scheme: 'light' | 'dark' | null = 'light';
    (RN.useColorScheme as jest.Mock).mockImplementation(() => scheme);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { getByText, rerender } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=false/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();

    // The OS flips to dark while the app is open.
    scheme = 'dark';
    rerender(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();
  });

  it('setThemeMode cycles light → dark → system and system follows the OS', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('dark');

    const { getByText } = renderTheme(<ThemeControlProbe />);

    // No stored override → mode=system, follows the dark system scheme.
    await waitFor(() => expect(getByText(/isDark=true mode=system/)).toBeTruthy());

    // Force light — must stay light even though the system is dark.
    fireEvent.press(getByText('set-light'));
    await waitFor(() => expect(getByText(/isDark=false mode=light/)).toBeTruthy());

    // Force dark.
    fireEvent.press(getByText('set-dark'));
    await waitFor(() => expect(getByText(/isDark=true mode=dark/)).toBeTruthy());

    // Back to system — follows the OS again (dark).
    fireEvent.press(getByText('set-system'));
    await waitFor(() => expect(getByText(/isDark=true mode=system/)).toBeTruthy());
  });

  it('persists the selected mode to AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('light');

    const { getByText } = renderTheme(<ThemeControlProbe />);
    await waitFor(() => expect(getByText(/mode=system/)).toBeTruthy());

    fireEvent.press(getByText('set-dark'));
    await waitFor(() => expect(getByText(/mode=dark/)).toBeTruthy());

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_KEY, 'dark');
  });

  it('treats an unknown stored theme value as system (migration safety)', async () => {
    // A value that is neither 'light'/'dark'/'system' (e.g. a legacy format)
    // must not be treated as an override — the app falls back to the system.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('blue') : Promise.resolve(null),
    );
    (RN.useColorScheme as jest.Mock).mockReturnValue('dark');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/mode=system/)).toBeTruthy());
    expect(getByText(/isDark=true/)).toBeTruthy();
  });

  it('a saved override is not affected by a later system scheme change', async () => {
    // Pin the clock to daytime so a time-based regression (the old C5 bug)
    // would deterministically render light and fail this test, no matter when
    // the suite runs.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
      let scheme: 'light' | 'dark' | null = 'light';
      (RN.useColorScheme as jest.Mock).mockImplementation(() => scheme);
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        key === THEME_KEY ? Promise.resolve('dark') : Promise.resolve(null),
      );

      const { getByText, rerender } = renderTheme(<ThemeProbe />);

      await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
      expect(getByText(/mode=dark/)).toBeTruthy();

      // The OS flips to light, but the saved dark override must hold.
      scheme = 'light';
      rerender(<ThemeProbe />);

      await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
      expect(getByText(/mode=dark/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

const SETTINGS_KEY = '@iostoandroid/settings';

function TypographyProbe() {
  const { typography } = useTheme();
  const fmt = (s: { fontFamily?: string; fontSize: number; fontWeight: string }) =>
    `${s.fontFamily}/${s.fontSize}/${s.fontWeight}`;
  return (
    <>
      <Text>{`body=${fmt(typography.body)}`}</Text>
      <Text>{`title3=${fmt(typography.title3)}`}</Text>
      <Text>{`largeTitle=${fmt(typography.largeTitle)}`}</Text>
    </>
  );
}

function renderTypography(settings: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === SETTINGS_KEY ? Promise.resolve(JSON.stringify(settings)) : Promise.resolve(null),
  );
  return render(<TypographyProbe />, {
    wrapper: ({ children }) => (
      <SettingsProvider gateFirstRender={false}>
        <ThemeProvider gateFirstRender={false}>{children}</ThemeProvider>
      </SettingsProvider>
    ),
  });
}

/**
 * O corte Text/Display do #475 é do tamanho *renderizado*. O Dynamic Type e o
 * Negrito de acessibilidade mexem no tamanho e no peso depois do token, por
 * isso é aqui — e não na tabela de tokens — que se prova que a família
 * continua a acompanhar, e que nenhum destes caminhos deixa `fontFamily` cair
 * (o que devolveria o ecrã ao Roboto).
 */
describe('Typography escalada mantém as famílias Inter (#475)', () => {
  it('keeps the token families at the default text size', async () => {
    const { getByText } = renderTypography({});

    await waitFor(() => expect(getByText('body=Inter/17/400')).toBeTruthy());
    expect(getByText('title3=InterDisplay/20/600')).toBeTruthy();
    expect(getByText('largeTitle=InterDisplay/34/700')).toBeTruthy();
  });

  it('moves a text token to Display when Dynamic Type pushes it past 20pt', async () => {
    // body 17pt × 1.3 = 22pt — acima do corte, logo Display.
    const { getByText } = renderTypography({ textSizeIndex: 3 });

    await waitFor(() => expect(getByText('body=InterDisplay/22/400')).toBeTruthy());
  });

  it('moves a display token to Text when Dynamic Type pulls it below 20pt', async () => {
    // O inverso: title3 20pt × 0.85 = 17pt — abaixo do corte, logo Text.
    const { getByText } = renderTypography({ textSizeIndex: 0 });

    await waitFor(() => expect(getByText('title3=Inter/17/600')).toBeTruthy());
    expect(getByText('largeTitle=InterDisplay/29/700')).toBeTruthy();
  });

  it('keeps the family when the bold-text setting bumps the weight', async () => {
    const { getByText } = renderTypography({ boldText: true });

    await waitFor(() => expect(getByText('body=Inter/17/600')).toBeTruthy());
    expect(getByText('largeTitle=InterDisplay/34/900')).toBeTruthy();
  });

  it('combines Dynamic Type and bold text without losing the family', async () => {
    const { getByText } = renderTypography({ textSizeIndex: 3, boldText: true });

    await waitFor(() => expect(getByText('body=InterDisplay/22/600')).toBeTruthy());
    expect(getByText('title3=InterDisplay/26/800')).toBeTruthy();
  });

  it('ignores an out-of-range text size index instead of dropping the family', async () => {
    // TEXT_SIZE_SCALE só tem 0..3; um índice fora disso cai no factor 1.0.
    const { getByText } = renderTypography({ textSizeIndex: 99 });

    await waitFor(() => expect(getByText('body=Inter/17/400')).toBeTruthy());
    expect(getByText('title3=InterDisplay/20/600')).toBeTruthy();
  });
});

/**
 * #477: a escolha 'system' tem de produzir a fonte real da plataforma — ou
 * seja, `fontFamily: undefined` — e não um fallback qualquer. Um `fontFamily`
 * ainda preenchido (mesmo que fosse 'Roboto') não seria a fonte do sistema
 * escolhida pelo utilizador, seria outro hardcode.
 */
describe('fontChoice: Inter vs fonte do sistema (#477)', () => {
  it('defaults to the Inter families when fontChoice is not set', async () => {
    const { getByText } = renderTypography({});

    await waitFor(() => expect(getByText('body=Inter/17/400')).toBeTruthy());
    expect(getByText('title3=InterDisplay/20/600')).toBeTruthy();
  });

  it('drops fontFamily entirely (undefined) for every token when fontChoice=system', async () => {
    const { getByText } = renderTypography({ fontChoice: 'system' });

    await waitFor(() => expect(getByText('body=undefined/17/400')).toBeTruthy());
    expect(getByText('title3=undefined/20/600')).toBeTruthy();
    expect(getByText('largeTitle=undefined/34/700')).toBeTruthy();
  });

  it('keeps fontFamily undefined for system choice even combined with Dynamic Type and bold text', async () => {
    // O corte Text/Display e o bump de peso continuam a aplicar-se ao tamanho
    // e ao peso; só a família é que fica de fora quando o utilizador pediu a
    // fonte do sistema — não pode "vazar" Inter por um caminho de escala.
    const { getByText } = renderTypography({ fontChoice: 'system', textSizeIndex: 3, boldText: true });

    await waitFor(() => expect(getByText('body=undefined/22/600')).toBeTruthy());
    expect(getByText('title3=undefined/26/800')).toBeTruthy();
  });

  it('switching fontChoice back to inter at runtime restores the Inter families', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === SETTINGS_KEY ? Promise.resolve(JSON.stringify({ fontChoice: 'system' })) : Promise.resolve(null),
    );

    function FontChoiceProbe() {
      const { typography } = useTheme();
      const { update } = useSettings();
      return (
        <>
          <Text>{`body=${typography.body.fontFamily}`}</Text>
          <Text onPress={() => update('fontChoice', 'inter')}>use-inter</Text>
        </>
      );
    }

    const { getByText } = render(<FontChoiceProbe />, {
      wrapper: ({ children }) => (
        <SettingsProvider gateFirstRender={false}>
          <ThemeProvider gateFirstRender={false}>{children}</ThemeProvider>
        </SettingsProvider>
      ),
    });

    await waitFor(() => expect(getByText('body=undefined')).toBeTruthy());

    fireEvent.press(getByText('use-inter'));

    await waitFor(() => expect(getByText('body=Inter')).toBeTruthy());
  });
});
