import React from 'react';
import { render } from '@testing-library/react-native';
import { CupertinoProgressBar } from '../CupertinoProgressBar';
import { ThemeProvider } from '../../theme/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

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
