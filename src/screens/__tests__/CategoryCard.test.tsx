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
});
