import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act } from '../../../test-utils';
import { useTheme } from '../../../theme/ThemeContext';
import { useSettings } from '../../../store/SettingsStore';
import { AccessibilityScreen } from '../AccessibilityScreen';
import { CupertinoSlider } from '../../../components/CupertinoSlider';

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

  it('renders Bold Text toggle unchanged', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Bold Text')).toBeTruthy();
  });

  // #493: Reduce Motion (binary) was replaced by the Motion section's 3-way
  // Full/Reduced/Off control — see the "Motion (#493)" describe block below.
  it('does not render the old Reduce Motion switch label', () => {
    const { queryByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(queryByText('Reduce Motion')).toBeNull();
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

    // Switch order in the Vision section (#493 removed Reduce Motion): [0] Bold Text, [1] High Contrast
    const switches = getAllByRole('switch');
    fireEvent.press(switches[1]);

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

    // Vision section order (#493 removed Reduce Motion): [0] Bold Text, [1] High Contrast,
    // [2] Reduce Transparency, [3] Smart Invert, [4] Color Filters
    const switches = getAllByRole('switch');
    fireEvent.press(switches[2]);

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

// Reads pressFeedback directly from SettingsStore — proves the control reaches
// the global store, not just local screen state.
function PressFeedbackReader() {
  const { settings } = useSettings();
  return <Text testID="press-feedback-value">{settings.pressFeedback}</Text>;
}

describe('AccessibilityScreen touch feedback (#497: scale+opacity / opacity / none)', () => {
  it('renders the Touch Feedback section with all 3 options', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Scale & Opacity')).toBeTruthy();
    expect(getByText('Opacity Only')).toBeTruthy();
    expect(getByText('None')).toBeTruthy();
  });

  it('defaults to Scale & Opacity selected', () => {
    const { getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <PressFeedbackReader />
      </>,
    );

    expect(getByTestId('press-feedback-value').props.children).toBe('scale-opacity');
  });

  it('selecting None updates the global SettingsStore pressFeedback', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <PressFeedbackReader />
      </>,
    );

    fireEvent.press(getByText('None'));

    expect(getByTestId('press-feedback-value').props.children).toBe('none');
  });

  it('selecting Opacity Only then Scale & Opacity again returns to scale-opacity (no stuck state)', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <PressFeedbackReader />
      </>,
    );

    fireEvent.press(getByText('Opacity Only'));
    expect(getByTestId('press-feedback-value').props.children).toBe('opacity');

    fireEvent.press(getByText('Scale & Opacity'));
    expect(getByTestId('press-feedback-value').props.children).toBe('scale-opacity');
  });
});

// Reads reduceWhitePoint + whitePointLevel directly from SettingsStore — proves
// the control reaches the global store, not just local screen state.
function WhitePointReader() {
  const { settings } = useSettings();
  return (
    <Text testID="wp-value">
      {`${String(settings.reduceWhitePoint)}|${String(settings.whitePointLevel)}`}
    </Text>
  );
}

describe('AccessibilityScreen — Reduce White Point (#614)', () => {
  it('renders the Reduce White Point toggle, default off', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <WhitePointReader />
      </>,
    );
    expect(getByText('Reduce White Point')).toBeTruthy();
    expect(getByTestId('wp-value').props.children).toBe('false|1');
  });

  it('toggling Reduce White Point updates the global SettingsStore', () => {
    const { getAllByRole, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <WhitePointReader />
      </>,
    );

    expect(getByTestId('wp-value').props.children).toBe('false|1');

    // Vision section order (#493 removed Reduce Motion): Bold Text, High Contrast,
    // Reduce Transparency, Smart Invert, Color Filters, Reduce White Point
    const switches = getAllByRole('switch');
    fireEvent.press(switches[5]);

    expect(getByTestId('wp-value').props.children).toBe('true|1');
  });

  it('slider is hidden while Reduce White Point is off', () => {
    const { UNSAFE_queryAllByType } = render(
      <AccessibilityScreen navigation={mockNavigation as never} />,
    );
    const sliders = UNSAFE_queryAllByType(CupertinoSlider);
    expect(sliders.find((s) => s.props.minimumValue === 0.25)).toBeUndefined();
  });

  it('slider appears when enabled and its change updates whitePointLevel', () => {
    const { getAllByRole, getByTestId, UNSAFE_queryAllByType } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <WhitePointReader />
      </>,
    );

    // turn on
    const switches = getAllByRole('switch');
    fireEvent.press(switches[5]);
    expect(getByTestId('wp-value').props.children).toBe('true|1');

    const sliders = UNSAFE_queryAllByType(CupertinoSlider);
    const wpSlider = sliders.find((s) => s.props.minimumValue === 0.25);
    expect(wpSlider).toBeTruthy();
    expect(wpSlider!.props.maximumValue).toBe(1.0);

    act(() => {
      wpSlider!.props.onValueChange(0.5);
    });
    expect(getByTestId('wp-value').props.children).toBe('true|0.5');
  });

  it('toggling twice (double-tap) returns to off without stuck state', () => {
    const { getAllByRole, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <WhitePointReader />
      </>,
    );

    const switches = getAllByRole('switch');
    fireEvent.press(switches[5]);
    expect(getByTestId('wp-value').props.children).toBe('true|1');
    fireEvent.press(switches[5]);
    expect(getByTestId('wp-value').props.children).toBe('false|1');
  });
});

// Reads motionIntensity + scrollDeceleration directly from SettingsStore —
// proves the controls reach the global store, not just local screen state.
function MotionReader() {
  const { settings } = useSettings();
  return (
    <Text testID="motion-value">
      {`${settings.motionIntensity}|${settings.scrollDeceleration}|${String(settings.reduceMotion)}`}
    </Text>
  );
}

describe('AccessibilityScreen — Motion (#493: motionIntensity + scrollDeceleration)', () => {
  it('renders the Motion section with Full/Reduced/Off and defaults to Full', () => {
    const { getByText, getAllByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <MotionReader />
      </>,
    );
    expect(getByText('Full')).toBeTruthy();
    expect(getByText('Reduced')).toBeTruthy();
    // 'Off' also labels the AssistiveTouch subtitle further down the screen
    // (enabled: false in the mocked store) — the Motion segment is the first match.
    expect(getAllByText('Off').length).toBeGreaterThanOrEqual(1);
    expect(getByTestId('motion-value').props.children).toBe('full|normal|false');
  });

  it('selecting Reduced updates motionIntensity and derives reduceMotion=true', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <MotionReader />
      </>,
    );

    fireEvent.press(getByText('Reduced'));

    expect(getByTestId('motion-value').props.children).toBe('reduced|normal|true');
  });

  it('selecting Off updates motionIntensity and derives reduceMotion=true', () => {
    const { getAllByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <MotionReader />
      </>,
    );

    // First 'Off' match is the Motion segmented control (AssistiveTouch's
    // subtitle 'Off' renders further down the screen).
    fireEvent.press(getAllByText('Off')[0]);

    expect(getByTestId('motion-value').props.children).toBe('off|normal|true');
  });

  it('selecting Off then Full again returns reduceMotion to false (no stuck state)', () => {
    const { getByText, getAllByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <MotionReader />
      </>,
    );

    fireEvent.press(getAllByText('Off')[0]);
    expect(getByTestId('motion-value').props.children).toBe('off|normal|true');

    fireEvent.press(getByText('Full'));
    expect(getByTestId('motion-value').props.children).toBe('full|normal|false');
  });

  it('renders the Scroll Deceleration section with Normal/Fast, defaults to Normal', () => {
    const { getByText } = render(<AccessibilityScreen navigation={mockNavigation as never} />);
    expect(getByText('Normal')).toBeTruthy();
    expect(getByText('Fast')).toBeTruthy();
  });

  it('selecting Fast updates scrollDeceleration without touching motionIntensity', () => {
    const { getByText, getByTestId } = render(
      <>
        <AccessibilityScreen navigation={mockNavigation as never} />
        <MotionReader />
      </>,
    );

    fireEvent.press(getByText('Fast'));

    expect(getByTestId('motion-value').props.children).toBe('full|fast|false');
  });
});
