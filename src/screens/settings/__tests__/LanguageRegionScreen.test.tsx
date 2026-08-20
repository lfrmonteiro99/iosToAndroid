import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '../../../test-utils';
import { LanguageRegionScreen } from '../LanguageRegionScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('LanguageRegionScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LanguageRegionScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows °F and US measurement when region is United States (default)', () => {
    const { getByText } = render(<LanguageRegionScreen navigation={mockNavigation} />);
    expect(getByText('°F')).toBeTruthy();
    expect(getByText('US')).toBeTruthy();
  });

  it('switches to °C and Metric when a metric region is selected', () => {
    const { getByText } = render(<LanguageRegionScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('France'));
    expect(getByText('°C')).toBeTruthy();
    expect(getByText('Metric')).toBeTruthy();
  });

  it('footer does not mention language text display or restart', () => {
    const { queryByText } = render(<LanguageRegionScreen navigation={mockNavigation} />);
    expect(queryByText(/app text display/i)).toBeNull();
    expect(queryByText(/restart/i)).toBeNull();
  });

  it('does not render a Language section', () => {
    const { queryByText } = render(<LanguageRegionScreen navigation={mockNavigation} />);
    expect(queryByText(/^English \(US\)$/)).toBeNull();
    expect(queryByText(/^Spanish$/)).toBeNull();
  });
});
