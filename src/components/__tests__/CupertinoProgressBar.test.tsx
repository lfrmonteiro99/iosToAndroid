import React from 'react';
// Shared harness, not a hand-rolled provider wrapper: SettingsProvider and
// ThemeProvider gate their first render on an async load, so wrapping them here
// rendered `null` and every snapshot compared against nothing. test-utils turns
// that gate off — see the comment there.
import { render as renderWithTheme } from '../../test-utils';
import { CupertinoProgressBar } from '../CupertinoProgressBar';

describe('CupertinoProgressBar', () => {
  it('renders at 0%', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoProgressBar progress={0} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders at 50%', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoProgressBar progress={0.5} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders at 100%', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoProgressBar progress={1} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with custom colors', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoProgressBar
        progress={0.75}
        trackColor="#E5E5EA"
        progressColor="#34C759"
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
