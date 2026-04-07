import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { CupertinoCard } from '../CupertinoCard';
import { ThemeProvider } from '../../theme/ThemeContext';
import { SettingsProvider } from '../../store/SettingsStore';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<SettingsProvider><ThemeProvider>{ui}</ThemeProvider></SettingsProvider>);

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
