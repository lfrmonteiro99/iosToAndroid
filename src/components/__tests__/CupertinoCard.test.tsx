import React from 'react';
import { Text } from 'react-native';
// Shared harness, not a hand-rolled provider wrapper: SettingsProvider and
// ThemeProvider gate their first render on an async load, so wrapping them here
// rendered `null` and every snapshot compared against nothing. test-utils turns
// that gate off — see the comment there.
import { render as renderWithTheme } from '../../test-utils';
import { CupertinoCard } from '../CupertinoCard';

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
});
