import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { MessagesScreen } from '../MessagesScreen';
import { useSettings } from '../../store/SettingsStore';

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

describe('MessagesScreen Dynamic Type', () => {
  it('Messages title fontSize scales with textSizeIndex (typography.largeTitle token)', () => {
    const { getByText, getByTestId } = render(
      <>
        <SetTextSize index={3} />
        <MessagesScreen />
      </>,
    );

    const defaultFontSize = getEffectiveFontSize(getByText('Messages'));

    fireEvent.press(getByTestId('set-text-size'));

    const scaledFontSize = getEffectiveFontSize(getByText('Messages'));
    expect(scaledFontSize).toBeGreaterThan(defaultFontSize);
  });
});

describe('MessagesScreen', () => {
  it('renders Messages title', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText('Messages')).toBeTruthy();
  });

  it('renders compose button', () => {
    const { getByLabelText } = render(<MessagesScreen />);
    expect(getByLabelText('Compose new message')).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<MessagesScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
