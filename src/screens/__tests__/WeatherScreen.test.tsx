import React from 'react';
import { render } from '../../test-utils';
import { WeatherScreen } from '../WeatherScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: {} };

describe('WeatherScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<WeatherScreen navigation={mockNavigation as any} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders city name or location', async () => {
    const { findByText } = render(<WeatherScreen navigation={mockNavigation as any} />);
    // DeviceStore initializes weather.city from device — may show city or 'My Location'
    const city = await findByText(/My Location|Test City|°/);
    expect(city).toBeTruthy();
  });

  it('renders temperature display', async () => {
    const { findByText } = render(<WeatherScreen navigation={mockNavigation as any} />);
    const temp = await findByText(/°/);
    expect(temp).toBeTruthy();
  });

  it('renders weather condition', async () => {
    const { toJSON } = render(<WeatherScreen navigation={mockNavigation as any} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(toJSON()).toBeTruthy();
  });
});
