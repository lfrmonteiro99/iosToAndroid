import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { render } from '../../test-utils';
import { NotificationBanner, BannerNotification } from '../NotificationBanner';
import { useSettings } from '../../store/SettingsStore';

// issue #493: motionIntensity ('full'|'reduced'|'off') replaces the binary
// reduceMotion for NotificationBanner's show animation. This file proves the
// 3 branches are distinct — spying on withSpring/withTiming works here
// because the effect in NotificationBanner is plain JS (not marked
// 'worklet' and not a Gesture callback), unlike settle() in
// AssistiveTouch/CupertinoSwipeableRow, whose reanimated calls are
// closure-captured by the Babel worklet plugin and can't be spied on (see
// useGestureReduceMotion.test.ts for that documented limitation).

// Gates mounting `children` until settings.motionIntensity === value, so
// NotificationBanner's own mount effect only ever runs once, with the target
// value already in place. Updating motionIntensity via useSettings().update()
// AFTER NotificationBanner has mounted (e.g. a sibling effect firing post-mount)
// would make its show-animation effect run twice — once with the 'full'
// default, once with the target — double-firing the haptic and contaminating
// the withSpring/withTiming spies this file relies on.
function WithMotionIntensity({
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

function makeNotification(over?: Partial<BannerNotification>): BannerNotification {
  return { id: 'n1', appName: 'Messages', title: 'Ana', body: 'Olá', ...over };
}

describe('NotificationBanner — motionIntensity branches (#493)', () => {
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

  it('"full" enters via withSpring, never withTiming', async () => {
    const utils = render(
      <WithMotionIntensity value="full">
        <NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />
      </WithMotionIntensity>,
    );
    await utils.findByText('Ana');
    expect(withSpringSpy).toHaveBeenCalled();
    expect(withTimingSpy).not.toHaveBeenCalled();
  });

  it('"reduced" enters via withTiming(duration: 150), never withSpring', async () => {
    const utils = render(
      <WithMotionIntensity value="reduced">
        <NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />
      </WithMotionIntensity>,
    );
    await utils.findByText('Ana');
    expect(withTimingSpy).toHaveBeenCalledWith(0, { duration: 150 });
    expect(withTimingSpy).toHaveBeenCalledWith(1, { duration: 150 });
    expect(withSpringSpy).not.toHaveBeenCalled();
  });

  it('"off" jumps directly — neither withSpring nor withTiming is called for the enter animation', async () => {
    const utils = render(
      <WithMotionIntensity value="off">
        <NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />
      </WithMotionIntensity>,
    );
    await utils.findByText('Ana');
    expect(withSpringSpy).not.toHaveBeenCalled();
    expect(withTimingSpy).not.toHaveBeenCalled();
  });

  // §3.2 regra 4 (#493): cortar animação não corta háptica.
  it('"off" still fires the notification haptic (motion and haptics are independent)', async () => {
    const utils = render(
      <WithMotionIntensity value="off">
        <NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />
      </WithMotionIntensity>,
    );
    await utils.findByText('Ana');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });
});
