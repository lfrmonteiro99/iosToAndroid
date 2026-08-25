import React from 'react';
import { View, Text } from 'react-native';
import { render } from '../../test-utils';
import { Ionicons } from '@expo/vector-icons';
import { SystemAppIcon } from '../SystemAppIcon';
import { APP_ICON_ARTWORK, buildAppIconArtwork } from '../appIcons';

// Every built-in app the launcher draws itself. Artwork is what makes these look
// like iOS stock icons rather than one Ionicons glyph on a coloured square, so
// the coverage here is about the CONTRACT of the registry (which packages are
// covered, that artwork replaces the glyph tile, that Tinted mode still wins)
// rather than pixel geometry, which belongs to the design and would make every
// visual tweak a test edit.
const ALL_BUILT_INS = [
  'com.iostoandroid.phone',
  'com.iostoandroid.messages',
  'com.iostoandroid.mail',
  'com.iostoandroid.browser',
  'com.iostoandroid.photos',
  'com.iostoandroid.camera',
  'com.iostoandroid.clock',
  'com.iostoandroid.calendar',
  'com.iostoandroid.weather',
  'com.iostoandroid.notes',
  'com.iostoandroid.reminders',
  'com.iostoandroid.calculator',
  'com.iostoandroid.contacts',
  'com.iostoandroid.settings',
  'com.iostoandroid.wallet',
  'com.iostoandroid.health',
  'com.iostoandroid.shortcuts',
  'com.iostoandroid.maps',
  'com.iostoandroid.findmy',
  'com.iostoandroid.appstore',
];

describe('app icon artwork registry', () => {
  it('covers every built-in app the launcher draws itself', () => {
    for (const pkg of ALL_BUILT_INS) {
      expect(APP_ICON_ARTWORK[pkg]).toBeDefined();
    }
  });

  it('renders every artwork at a small and a large size without throwing', () => {
    // The whole point of expressing the shapes as fractions of the tile is that
    // one definition holds at any icon size; 28dp is roughly a folder preview
    // and 76dp a 4-column grid cell.
    for (const pkg of ALL_BUILT_INS) {
      for (const size of [28, 76]) {
        const { toJSON, unmount } = render(
          <SystemAppIcon icon="apps" packageName={pkg} size={size} />,
        );
        expect(toJSON()).toBeTruthy();
        unmount();
      }
    }
  });
});

describe('SystemAppIcon with artwork', () => {
  it('drops the glyph tile for an app that has artwork', () => {
    // Clock is drawn as a dial: a white face, ticks and hands. If the glyph
    // fallback were still rendering, the passed-in Ionicons would be in the tree.
    const { UNSAFE_queryAllByType } = render(
      <SystemAppIcon icon="time" packageName="com.iostoandroid.clock" size={60} />,
    );
    expect(UNSAFE_queryAllByType(Ionicons)).toHaveLength(0);
  });

  it('keeps the glyph tile for an app with no artwork', () => {
    const { UNSAFE_getByType } = render(
      <SystemAppIcon icon="game-controller" packageName="com.example.unknown" size={60} />,
    );
    expect(UNSAFE_getByType(Ionicons).props.name).toBe('game-controller');
  });

  it('keeps the glyph tile when no packageName is given at all', () => {
    const { UNSAFE_getByType } = render(<SystemAppIcon icon="mail" size={60} />);
    expect(UNSAFE_getByType(Ionicons).props.name).toBe('mail');
  });

  it('Tinted mode overrides artwork — a tint is a one-colour stencil', () => {
    // Without this, "Tinted Icons" would silently do nothing for exactly the
    // apps that got artwork, which is most of them.
    const { UNSAFE_getByType } = render(
      <SystemAppIcon
        icon="time"
        packageName="com.iostoandroid.clock"
        size={60}
        tint="#FF2D55"
      />,
    );
    expect(UNSAFE_getByType(Ionicons).props.name).toBe('time');
  });

  it('an explicit artwork prop wins over the registry', () => {
    function Stub() {
      return <Text>stub-artwork</Text>;
    }
    const { getByText } = render(
      <SystemAppIcon
        icon="time"
        packageName="com.iostoandroid.clock"
        size={60}
        artwork={Stub}
      />,
    );
    expect(getByText('stub-artwork')).toBeTruthy();
  });

  it('keeps the iOS continuous-corner radius on the tile', () => {
    // 0.2237 x side. Artwork fills the tile, so losing this would square off
    // every built-in icon at once.
    const { getByTestId } = render(
      <SystemAppIcon icon="time" packageName="com.iostoandroid.clock" size={60} testID="tile" />,
    );
    const style = getByTestId('tile').props.style;
    const flat = (Array.isArray(style) ? style : [style]).filter(Boolean);
    const radius = flat.map((s) => (s as { borderRadius?: number }).borderRadius).find((r) => r != null);
    expect(radius).toBeCloseTo(60 * 0.2237, 4);
  });
});

describe('Calendar artwork', () => {
  it('shows the given date, so the icon face tracks today like iOS', () => {
    const registry = buildAppIconArtwork(new Date(2026, 7, 25)); // 25 Aug 2026
    const Calendar = registry['com.iostoandroid.calendar'];
    const { getByText } = render(
      <View>
        <Calendar size={60} />
      </View>,
    );
    expect(getByText('25')).toBeTruthy();
  });

  it('renders a different day for a different date', () => {
    const registry = buildAppIconArtwork(new Date(2026, 0, 3));
    const Calendar = registry['com.iostoandroid.calendar'];
    const { getByText } = render(
      <View>
        <Calendar size={60} />
      </View>,
    );
    expect(getByText('3')).toBeTruthy();
  });
});
