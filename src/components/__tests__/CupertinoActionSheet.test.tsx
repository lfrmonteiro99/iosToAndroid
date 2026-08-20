import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { CupertinoActionSheet } from '../CupertinoActionSheet';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled } from '../../utils/haptics';
import { useSettings } from '../../store/SettingsStore';

/** Returns the effective (last-wins) fontSize from a React Native style array. */
function getEffectiveFontSize(element: { props: { style: unknown } }): number {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  let fontSize = 0;
  for (const s of styles) {
    if (s && typeof s === 'object' && 'fontSize' in (s as object)) {
      fontSize = (s as { fontSize: number }).fontSize;
    }
  }
  return fontSize;
}

function SetTextSize({ index }: { index: number }) {
  const { update } = useSettings();
  return (
    <Pressable testID="set-text-size" onPress={() => update('textSizeIndex', index)}>
      <Text>resize</Text>
    </Pressable>
  );
}

/** Turns the real `vibration` setting off; SettingsStore feeds the haptics cache. */
function DisableVibration() {
  const { update } = useSettings();
  return (
    <Pressable testID="disable-vibration" onPress={() => update('vibration', false)}>
      <Text>off</Text>
    </Pressable>
  );
}

// CupertinoActionSheet used to call Haptics.impactAsync() directly (H5), bypassing
// the user's vibration setting and leaving a rejected promise unhandled. It now
// routes through hapticImpact() from src/utils/haptics.ts.

async function collectUnhandledRejections(fn: () => void): Promise<unknown[]> {
  const captured: unknown[] = [];
  const handler = (reason: unknown) => captured.push(reason);
  process.on('unhandledRejection', handler);
  try {
    fn();
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off('unhandledRejection', handler);
  }
  return captured;
}

describe('CupertinoActionSheet Dynamic Type', () => {
  it('option label fontSize scales with textSizeIndex', () => {
    const { getByText, getByTestId } = render(
      <>
        <SetTextSize index={3} />
        <CupertinoActionSheet
          visible
          onClose={jest.fn()}
          options={[{ label: 'Option', onPress: jest.fn() }]}
        />
      </>,
    );

    const defaultFontSize = getEffectiveFontSize(getByText('Option'));

    // Push textSizeIndex to maximum (3, scale 1.3×)
    fireEvent.press(getByTestId('set-text-size'));

    const scaledFontSize = getEffectiveFontSize(getByText('Option'));
    expect(scaledFontSize).toBeGreaterThan(defaultFontSize);
  });
});

describe('CupertinoActionSheet haptics (H5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true);
  });

  afterEach(() => {
    setHapticsEnabled(true);
  });

  it('plays light impact haptics when an option is pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <CupertinoActionSheet
        visible
        onClose={jest.fn()}
        options={[{ label: 'Delete', onPress, destructive: true }]}
      />,
    );

    fireEvent.press(getByText('Delete'));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not touch the native module when the user disabled vibration', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <>
        <DisableVibration />
        <CupertinoActionSheet
          visible
          onClose={jest.fn()}
          options={[{ label: 'Delete', onPress }]}
        />
      </>,
    );

    fireEvent.press(getByTestId('disable-vibration'));
    fireEvent.press(getByText('Delete'));

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    // The action itself must still run — the setting silences vibration, not the app.
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('plays haptics once per press when the same option is tapped twice', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <CupertinoActionSheet
        visible
        onClose={jest.fn()}
        options={[{ label: 'Delete', onPress }]}
      />,
    );

    fireEvent.press(getByText('Delete'));
    fireEvent.press(getByText('Delete'));

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('renders an empty option list without playing haptics', () => {
    render(
      <CupertinoActionSheet visible onClose={jest.fn()} options={[]} cancelLabel="Cancel" />,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('does not leak an unhandled rejection when the native module rejects', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('haptics unavailable'));

    const { getByText } = render(
      <CupertinoActionSheet
        visible
        onClose={jest.fn()}
        options={[{ label: 'Delete', onPress: jest.fn() }]}
      />,
    );

    const unhandled = await collectUnhandledRejections(() => {
      fireEvent.press(getByText('Delete'));
    });

    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });
});
