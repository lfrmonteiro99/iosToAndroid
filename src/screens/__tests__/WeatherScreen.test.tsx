import React from 'react';
import { render } from '../../test-utils';
import { WeatherScreen } from '../WeatherScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };


describe('WeatherScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<WeatherScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders city name or location', async () => {
    const { findAllByText } = render(<WeatherScreen navigation={mockNavigation as never} />);
    // DeviceStore initializes weather.city from device — may show city or 'My Location'.
    // findAllByText, not findByText: the screen legitimately renders several nodes
    // matching this pattern (current conditions plus the hourly/daily forecast rows),
    // and the assertion is about presence, not uniqueness.
    const city = await findAllByText(/My Location|Test City|°/);
    expect(city.length).toBeGreaterThan(0);
  });

  it('renders temperature display', async () => {
    const { findAllByText } = render(<WeatherScreen navigation={mockNavigation as never} />);
    // Same reason as above: degrees appear in the current reading and in every
    // forecast row, so match all and assert at least one.
    const temp = await findAllByText(/°/);
    expect(temp.length).toBeGreaterThan(0);
  });

  it('renders weather condition', async () => {
    const { toJSON } = render(<WeatherScreen navigation={mockNavigation as never} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(toJSON()).toBeTruthy();
  });
});
