import React from 'react';
import { Text } from 'react-native';
// Shared harness, not a hand-rolled provider wrapper: SettingsProvider and
// ThemeProvider gate their first render on an async load, so wrapping them here
// rendered `null` and every snapshot compared against nothing. test-utils turns
// that gate off — see the comment there.
import { render as renderWithTheme } from '../../test-utils';
import { CupertinoCard } from '../CupertinoCard';
import { Shape } from '../../theme/CupertinoTheme';

describe('CupertinoCard', () => {
  it('renders with title and subtitle', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoCard title="Title" subtitle="Subtitle">
        <Text>Content</Text>
      </CupertinoCard>,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders without title', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoCard>
        <Text>Just content</Text>
      </CupertinoCard>,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('has shadowColor defined for Android elevation (visibility on OEM skins)', () => {
    const { root } = renderWithTheme(
      <CupertinoCard>
        <Text>Card with shadow</Text>
      </CupertinoCard>,
    );

    // root is the View component returned by CupertinoCard
    const styles = root.props.style;

    // Find the shadow style object in the style array
    const shadowStyle = Array.isArray(styles)
      ? styles.find((s) => s && typeof s === 'object' && 'elevation' in s)
      : null;

    // Verify shadowColor is explicitly defined for Android OEMs that rely on it
    expect(shadowStyle).toBeDefined();
    expect(shadowStyle?.shadowColor).toBe('#000');
    expect(shadowStyle?.elevation).toBe(4);
  });

  it('uses the Shape.card radius token (10), not the old BorderRadius.medium (12) — spec §1.6', () => {
    const { root } = renderWithTheme(
      <CupertinoCard>
        <Text>Card</Text>
      </CupertinoCard>,
    );

    const styles = root.props.style;
    const radiusStyle = Array.isArray(styles)
      ? styles.find((s) => s && typeof s === 'object' && 'borderRadius' in s)
      : null;

    expect(radiusStyle).toBeDefined();
    expect(radiusStyle?.borderRadius).toBe(Shape.card.radius);
    expect(radiusStyle?.borderRadius).toBe(10);
  });
});
