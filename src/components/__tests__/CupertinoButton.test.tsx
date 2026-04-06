import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CupertinoButton } from '../CupertinoButton';
import { ThemeProvider } from '../../theme/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('CupertinoButton', () => {
  it('renders filled variant', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoButton title="Test" variant="filled" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders tinted variant', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoButton title="Test" variant="tinted" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders plain variant', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoButton title="Test" variant="plain" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders destructive variant', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoButton title="Delete" variant="filled" destructive />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders disabled state', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoButton title="Disabled" variant="filled" disabled />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithTheme(
      <CupertinoButton title="Tap Me" onPress={onPress} />,
    );
    fireEvent.press(getByText('Tap Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithTheme(
      <CupertinoButton title="Disabled" onPress={onPress} disabled />,
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
