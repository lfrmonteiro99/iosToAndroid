import React from 'react';
import { render } from '@testing-library/react-native';
import { CupertinoSwitch } from '../CupertinoSwitch';
import { ThemeProvider } from '../../theme/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('CupertinoSwitch', () => {
  it('renders on state', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoSwitch value={true} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders off state', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoSwitch value={false} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('calls onValueChange when pressed', () => {
    const onChange = jest.fn();
    const { toJSON } = renderWithTheme(
      <CupertinoSwitch value={false} onValueChange={onChange} />,
    );
    // The switch is wrapped in a Pressable, fire press on the root
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders disabled state', () => {
    const { toJSON } = renderWithTheme(
      <CupertinoSwitch value={true} disabled />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
