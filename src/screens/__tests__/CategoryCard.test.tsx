import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CategoryCard } from '../AppLibraryScreen';
import type { InstalledApp } from '../../store/AppsStore';

function makeApps(count: number): InstalledApp[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `App ${i}`,
    packageName: `com.test.app${i}`,
    icon: '',
    isSystem: false,
  }));
}

const CARD_WIDTH = 165;

function renderCard(count: number, overrides?: Partial<React.ComponentProps<typeof CategoryCard>>) {
  const onPress = jest.fn();
  const onLaunchApp = jest.fn();
  const apps = makeApps(count);
  const utils = render(
    <CategoryCard
      title="Social"
      apps={apps}
      cardWidth={CARD_WIDTH}
      onPress={onPress}
      onLaunchApp={onLaunchApp}
      badgeCounts={{}}
      showNotifications
      {...overrides}
    />
  );
  return { ...utils, onPress, onLaunchApp, apps };
}

describe('CategoryCard — quadrant layout', () => {
  it('renders exactly 3 large-icon slots plus a quadrant when there are 5+ apps', () => {
    const { getByLabelText } = renderCard(5);
    // 3 large icons open their own app
    expect(getByLabelText('Open App 0, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 1, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 2, App Library')).toBeTruthy();
    // 4th large icon does NOT exist — it becomes the quadrant instead
    expect(() => getByLabelText('Open App 3, App Library')).toThrow();
    // the quadrant itself exists
    expect(getByLabelText('See all 5 apps in Social')).toBeTruthy();
  });

  it('does not render a quadrant for exactly 4 apps — shows 4 large icons instead', () => {
    const { getByLabelText, queryByLabelText } = renderCard(4);
    expect(getByLabelText('Open App 0, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 1, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 2, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 3, App Library')).toBeTruthy();
    expect(queryByLabelText('See all 4 apps in Social')).toBeNull();
  });

  it.each([1, 2, 3])('renders exactly %i large icons and no quadrant for %i apps', (count) => {
    const { queryByLabelText } = renderCard(count);
    for (let i = 0; i < count; i++) {
      expect(queryByLabelText(`Open App ${i}, App Library`)).toBeTruthy();
    }
    // no extra slots beyond what exists
    expect(queryByLabelText(`Open App ${count}, App Library`)).toBeNull();
    expect(queryByLabelText(`See all ${count} apps in Social`)).toBeNull();
  });

  it('caps the quadrant at 4 mini icons for 8 apps, with the count text reflecting the true total', () => {
    const { getByLabelText, getByText } = renderCard(8);
    expect(getByLabelText('Open App 0, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 1, App Library')).toBeTruthy();
    expect(getByLabelText('Open App 2, App Library')).toBeTruthy();
    expect(getByLabelText('See all 8 apps in Social')).toBeTruthy();
    expect(getByText('8 apps')).toBeTruthy();
  });

  it('tapping a large icon launches that app and does not open the category', () => {
    const { getByLabelText, onLaunchApp, onPress } = renderCard(5);
    fireEvent.press(getByLabelText('Open App 1, App Library'));
    expect(onLaunchApp).toHaveBeenCalledWith('com.test.app1');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('tapping the quadrant opens the category and does not launch an app', () => {
    const { getByLabelText, onLaunchApp, onPress } = renderCard(6);
    fireEvent.press(getByLabelText('See all 6 apps in Social'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLaunchApp).not.toHaveBeenCalled();
  });

  it('tapping the card outside any icon (title area) opens the category', () => {
    const { getByText, onPress } = renderCard(5);
    fireEvent.press(getByText('Social'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Regression for issue #679: a category with exactly 1-3 apps left a 4th empty
  // 2x2 grid cell (white hole, bottom-right). The grid must collapse to a single
  // row (no empty trailing cell) when there are 3 or fewer icons.
  it.each([1, 2, 3])('lays out %i app(s) in a single row (no empty 2x2 cell)', (count) => {
    const { getByTestId } = renderCard(count);
    expect(getByTestId('category-icon-grid')).toHaveStyle({ flexWrap: 'nowrap' });
  });

  // 4 apps should still render as a 2x2 grid (wrap), not collapse to a row —
  // the inverse of the fix above, to guard against over-correcting.
  it('keeps the 2x2 grid (flexWrap wrap) for exactly 4 apps', () => {
    const { getByTestId } = renderCard(4);
    expect(getByTestId('category-icon-grid')).toHaveStyle({ flexWrap: 'wrap' });
  });
});

// ---------------------------------------------------------------------------
// iOS-style transparent cluster: App Library categories are NOT white rounded
// cards. On iOS the category is a title + a cluster of icons sitting directly
// on the blurred wallpaper, no closed card container. (issue #680)
// ---------------------------------------------------------------------------

// Collect every style entry applied to the *root* CategoryCard container so we
// can assert on the card's own box, not on the inner icon grid.
function rootStyleEntries(json: ReturnType<ReturnType<typeof renderCard>['toJSON']>) {
  const style = json?.props?.style;
  if (!style) return [];
  return Array.isArray(style) ? style : [style];
}

describe('CategoryCard — iOS-style transparent cluster (no card)', () => {
  it('does not render a white/rounded card container; icons sit directly on the background', () => {
    const { toJSON } = renderCard(5);
    const entries = rootStyleEntries(toJSON());
    const hasCardBackground = entries.some(
      (e) => e && typeof e === 'object' && 'backgroundColor' in e,
    );
    const hasRoundedCorner = entries.some(
      (e) => e && typeof e === 'object' && 'borderRadius' in e,
    );
    expect(hasCardBackground).toBe(false);
    expect(hasRoundedCorner).toBe(false);
  });

  it('keeps the container width + inset padding but drops the card background and corners', () => {
    const { toJSON } = renderCard(4);
    const entries = rootStyleEntries(toJSON());
    const flat = Object.assign({}, ...(entries.filter(Boolean) as object[]));
    expect((flat as { width?: number }).width).toBe(CARD_WIDTH);
    expect((flat as { padding?: number }).padding).toBe(12);
    expect((flat as { backgroundColor?: string }).backgroundColor).toBeUndefined();
    expect((flat as { borderRadius?: number }).borderRadius).toBeUndefined();
  });

  it('renders an empty category (0 apps) without a card background', () => {
    const { getByText, toJSON } = renderCard(0);
    expect(getByText('0 apps')).toBeTruthy();
    const entries = rootStyleEntries(toJSON());
    expect(
      entries.some((e) => e && typeof e === 'object' && 'backgroundColor' in e),
    ).toBe(false);
  });
});
