import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import { CupertinoContextMenu } from '../CupertinoContextMenu';
import type { ContextMenuItem } from '../CupertinoContextMenu';
import { useSettings } from '../../store/SettingsStore';

// issue #650 / filho #632: new CupertinoContextMenu — long-press trigger opens a
// spring scale + fade menu over a blurred backdrop, with haptics, reduced-motion
// tri-state and a11y. This file proves the behaviour, including the three
// motionIntensity branches being distinct (same approach as
// NotificationBanner.motionIntensity.test.tsx — the component's open effect is
// plain JS, not a 'worklet', so Reanimated's withSpring/withTiming CAN be spied
// on here).

function makeItems(over: Partial<ContextMenuItem>[] = []): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { label: 'Edit', onPress: jest.fn() },
    { label: 'Delete', onPress: jest.fn(), destructive: true },
  ];
  return base.map((it, i) => ({ ...it, ...(over[i] ?? {}) }));
}

function WithMotion({
  value,
  children,
}: {
  value: 'full' | 'reduced' | 'off';
  children: React.ReactNode;
}) {
  const { settings, update } = useSettings();
  React.useEffect(() => {
    if (settings.motionIntensity !== value) update('motionIntensity', value);
  }, [settings.motionIntensity, update, value]);
  if (settings.motionIntensity !== value) return null;
  return <>{children}</>;
}

describe('CupertinoContextMenu — open/close interaction', () => {
  it('opens on long-press and reveals the menu rows', async () => {
    const items = makeItems();
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );

    // Closed: rows are not in the tree (Modal visible=false renders nothing).
    expect(getByLabelText('Open menu')).toBeTruthy();
    expect(() => getByLabelText('Edit')).toThrow();

    fireEvent(getByLabelText('Open menu'), 'longPress' as never);

    await findByText('Edit');
    expect(getByLabelText('Delete')).toBeTruthy();
  });

  it('does NOT open on a plain short press', () => {
    const items = makeItems();
    const { getByLabelText, queryByLabelText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );

    fireEvent.press(getByLabelText('Open menu'));

    expect(queryByLabelText('Edit')).toBeNull();
  });

  it('runs the item onPress and closes the menu when a row is tapped', async () => {
    const items = makeItems();
    const { getByLabelText, findByText, queryByLabelText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );

    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Edit');

    fireEvent.press(getByLabelText('Edit'));

    expect(items[0].onPress).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByLabelText('Edit')).toBeNull());
  });

  it('closes when the backdrop is pressed', async () => {
    const items = makeItems();
    const { getByLabelText, findByText, queryByLabelText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );

    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Edit');

    // The backdrop is the absolute-fill Pressable labelled "Close menu".
    fireEvent.press(getByLabelText('Close menu', { includeHiddenElements: true }));

    await waitFor(() => expect(queryByLabelText('Edit')).toBeNull());
  });

  it('does not fire onPress for a disabled row', async () => {
    const items = makeItems([{ onPress: jest.fn() }, { onPress: jest.fn(), destructive: true, disabled: true }]);
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );

    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Edit');

    const disabledRow = getByLabelText('Delete');
    expect(disabledRow.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(disabledRow);
    expect(items[1].onPress).not.toHaveBeenCalled();
  });

  it('renders the header title when provided', async () => {
    const items = makeItems();
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" title="Actions" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );
    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Actions');
  });

  it('handles an empty item list without throwing', async () => {
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={[]}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );
    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('trigger');
  });
});

describe('CupertinoContextMenu — haptics (§3.2 rule 4: motion cut never cuts haptics)', () => {
  it('fires the selection haptic on open regardless of motion', async () => {
    const items = makeItems();
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );
    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Edit');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('fires an impact haptic when a row is tapped', async () => {
    const items = makeItems();
    const { getByLabelText, findByText } = render(
      <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
        <Text>trigger</Text>
      </CupertinoContextMenu>,
    );
    fireEvent(getByLabelText('Open menu'), 'longPress' as never);
    await findByText('Edit');
    fireEvent.press(getByLabelText('Edit'));
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });
});

describe('CupertinoContextMenu — motionIntensity branches (#650)', () => {
  let withSpringSpy: jest.SpyInstance;
  let withTimingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    withSpringSpy = jest.spyOn(Reanimated, 'withSpring');
    withTimingSpy = jest.spyOn(Reanimated, 'withTiming');
  });

  afterEach(() => {
    withSpringSpy.mockRestore();
    withTimingSpy.mockRestore();
  });

  async function openWithMotion(value: 'full' | 'reduced' | 'off') {
    const items = makeItems();
    const utils = render(
      <WithMotion value={value}>
        <CupertinoContextMenu accessibilityLabel="Open menu" items={items}>
          <Text>trigger</Text>
        </CupertinoContextMenu>
      </WithMotion>,
    );
    fireEvent(utils.getByLabelText('Open menu') as never, 'longPress' as never);
    await utils.findByText('Edit');
    return utils;
  }

  it('"full" opens the card via withSpring', async () => {
    await openWithMotion('full');
    expect(withSpringSpy).toHaveBeenCalled();
  });

  it('"reduced" opens the card via withTiming, never withSpring', async () => {
    await openWithMotion('reduced');
    expect(withSpringSpy).not.toHaveBeenCalled();
    expect(withTimingSpy).toHaveBeenCalled();
  });

  it('"off" jumps directly — neither withSpring nor withTiming for the open', async () => {
    await openWithMotion('off');
    expect(withSpringSpy).not.toHaveBeenCalled();
    expect(withTimingSpy).not.toHaveBeenCalled();
  });
});
