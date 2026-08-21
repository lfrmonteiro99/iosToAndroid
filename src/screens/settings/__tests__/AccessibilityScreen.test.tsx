import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '../../../test-utils';
import { useTheme } from '../../../theme/ThemeContext';
import { useSettings } from '../../../store/SettingsStore';
import { AccessibilityScreen } from '../AccessibilityScreen';

// AccessibilityScreen uses useAssistiveTouch which requires AssistiveTouchProvider.
// Provide a minimal stub so the screen renders without the full provider tree.
jest.mock('../../../store/AssistiveTouchStore', () => ({
  useAssistiveTouch: () => ({ enabled: false }),
}));

// AccessibilityScreen calls AsyncStorage.getMany (non-standard); mock it
// here so the useEffect doesn't throw in tests.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// Reads highContrast directly from ThemeContext — proves the toggle reached
// the context, not just the screen's local state.
function HighContrastReader() {
  const { highContrast } = useTheme();
  return <Text testID="hc-value">{String(highContrast)}</Text>;
}

// Reads reduceTransparency directly from SettingsStore — proves the toggle reached
// the global store, not just local screen state (issue #506's exact symptom: a
// switch with no interruptor behind it).
function ReduceTransparencyReader() {
  const { settings } = useSettings();
  return <Text testID="rt-value">{String(settings.reduceTransparency)}</Text>;
}

describe('AccessibilityScreen', () => {
  it('renders the High Contrast toggle', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('High Contrast')).toBeTruthy();
  });

  it('renders Bold Text and Reduce Motion toggles unchanged', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Bold Text')).toBeTruthy();
    expect(getByText('Reduce Motion')).toBeTruthy();
  });

  // Red step: with the old shadow state, pressing the switch only updated local
  // React state — ThemeContext.highContrast stayed false. This test fails before
  // the fix and passes after.
  it('toggling High Contrast updates ThemeContext, not just local state', () => {
    const { getAllByRole, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <HighContrastReader />
      </>,
    );

    expect(getByTestId('hc-value').props.children).toBe('false');

    // Switch order in the Vision section: [0] Bold Text, [1] Reduce Motion, [2] High Contrast
    const switches = getAllByRole('switch');
    fireEvent.press(switches[2]);

    expect(getByTestId('hc-value').props.children).toBe('true');
  });

  it('renders the Reduce Transparency toggle', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Reduce Transparency')).toBeTruthy();
  });

  it('toggling Reduce Transparency updates the global SettingsStore, defaults to off', () => {
    const { getAllByRole, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <ReduceTransparencyReader />
      </>,
    );

    expect(getByTestId('rt-value').props.children).toBe('false');

    // Vision section order: [0] Bold Text, [1] Reduce Motion, [2] High Contrast,
    // [3] Reduce Transparency, [4] Smart Invert, [5] Color Filters
    const switches = getAllByRole('switch');
    fireEvent.press(switches[3]);

    expect(getByTestId('rt-value').props.children).toBe('true');
  });
});

// Reads fontChoice directly from SettingsStore — proves the control reached
// the global store, not just local screen state.
function FontChoiceReader() {
  const { settings } = useSettings();
  return <Text testID="font-choice-value">{settings.fontChoice}</Text>;
}

describe('AccessibilityScreen font choice (#477: Inter or system typeface)', () => {
  it('renders the Font section with Inter and System options', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Inter')).toBeTruthy();
    expect(getByText('System')).toBeTruthy();
  });

  it('defaults to Inter selected', () => {
    const { getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <FontChoiceReader />
      </>,
    );

    expect(getByTestId('font-choice-value').props.children).toBe('inter');
  });

  it('selecting System updates the global SettingsStore fontChoice', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <FontChoiceReader />
      </>,
    );

    fireEvent.press(getByText('System'));

    expect(getByTestId('font-choice-value').props.children).toBe('system');
  });

  it('selecting System then Inter again returns to inter (no stuck state)', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <FontChoiceReader />
      </>,
    );

    fireEvent.press(getByText('System'));
    expect(getByTestId('font-choice-value').props.children).toBe('system');

    fireEvent.press(getByText('Inter'));
    expect(getByTestId('font-choice-value').props.children).toBe('inter');
  });
});
