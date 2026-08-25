import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';

// RNTL doesn't expose a `fireEvent.longPress` helper; long-press is the
// 'longPress' synthetic event, which maps to the Pressable `onLongPress` prop.
function longPress(node: ReturnType<typeof render> extends never ? never : Parameters<typeof fireEvent>[0]) {
  return fireEvent(node as never, 'longPress');
}
import { IOContextMenu } from '../IOContextMenu';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled } from '../../utils/haptics';
import { useSettings } from '../../store/SettingsStore';

function SetReduceMotion({ value }: { value: boolean }) {
  const { update } = useSettings();
  React.useEffect(() => { update('reduceMotion', value); }, [update, value]);
  return null;
}

function SetVibration({ value }: { value: boolean }) {
  const { update } = useSettings();
  React.useEffect(() => { update('vibration', value); }, [update, value]);
  return null;
}

// Long-press iOS context menu (spec §13). On long-press of the wrapped element
// the menu opens next to it, plays a haptic, and shows its items. Short tap and
// a long-press on an empty menu must not open anything.
describe('IOContextMenu — long-press open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true);
  });

  afterEach(() => {
    setHapticsEnabled(true);
  });

  it('opens and renders its items after a long-press on the trigger', () => {
    const { getByText, queryByText } = render(
      <IOContextMenu items={[{ label: 'Edit', onPress: jest.fn() }, { label: 'Duplicate', onPress: jest.fn() }]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    // Menu is closed before any interaction.
    expect(queryByText('Edit')).toBeNull();

    longPress(getByText('Trigger'));

    // The defect: a stub that ignores long-press leaves the items unmounted.
    expect(getByText('Edit')).toBeTruthy();
    expect(getByText('Duplicate')).toBeTruthy();
  });

  it('does NOT open on a short tap', () => {
    const { getByText, queryByText } = render(
      <IOContextMenu
        items={[{ label: 'Share', onPress: jest.fn() }, { label: 'Delete', onPress: jest.fn(), destructive: true }]}
      >
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    fireEvent.press(getByText('Trigger'));

    expect(queryByText('Share')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
  });

  it('plays a selection haptic when the menu opens', () => {
    const { getByText } = render(
      <IOContextMenu items={[{ label: 'Edit', onPress: jest.fn() }]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    longPress(getByText('Trigger'));

    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('silences haptics when the user disabled vibration but still opens', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <>
        <SetVibration value={false} />
        <IOContextMenu items={[{ label: 'Edit', onPress }]}>
          <Text>Trigger</Text>
        </IOContextMenu>
      </>,
    );

    fireEvent.press(getByTestId('ctx-trigger'));
    longPress(getByText('Trigger'));

    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(getByText('Edit')).toBeTruthy();
  });

  it('does not open on long-press when there are no items', () => {
    const { getByText, queryByText } = render(
      <IOContextMenu items={[]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    longPress(getByText('Trigger'));

    expect(queryByText('Edit')).toBeNull();
  });

  it('still renders the trigger child (even when closed)', () => {
    const { getByText } = render(
      <IOContextMenu items={[{ label: 'Edit', onPress: jest.fn() }]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );
    expect(getByText('Trigger')).toBeTruthy();
  });

  it('runs the item handler and closes when an item is pressed', () => {
    const onPress = jest.fn();
    const { getByText, queryByText } = render(
      <IOContextMenu items={[{ label: 'Edit', onPress }]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    longPress(getByText('Trigger'));
    fireEvent.press(getByText('Edit'));

    expect(onPress).toHaveBeenCalledTimes(1);
    // Menu should dismiss after an action.
    expect(queryByText('Edit')).toBeNull();
  });

  it('closes when the backdrop is pressed', () => {
    const { getByText, getByTestId, queryByText } = render(
      <IOContextMenu items={[{ label: 'Edit', onPress: jest.fn() }]}>
        <Text>Trigger</Text>
      </IOContextMenu>,
    );

    longPress(getByText('Trigger'));
    expect(getByText('Edit')).toBeTruthy();

    fireEvent.press(getByTestId('ctx-backdrop'));
    expect(queryByText('Edit')).toBeNull();
  });

  it('opens without throwing when reduced motion is on', () => {
    const { getByText } = render(
      <>
        <SetReduceMotion value={true} />
        <IOContextMenu items={[{ label: 'Edit', onPress: jest.fn() }]}>
          <Text>Trigger</Text>
        </IOContextMenu>
      </>,
    );

    longPress(getByText('Trigger'));
    expect(getByText('Edit')).toBeTruthy();
  });
});
