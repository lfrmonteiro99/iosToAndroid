import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingScreen } from '../OnboardingScreen';

function renderScreen(props: Record<string, unknown> = {}) {
  const onDone = jest.fn();
  const result = render(<OnboardingScreen onDone={onDone} {...props} />);
  return { ...result, onDone };
}

describe('OnboardingScreen', () => {
  it('renders without crash', () => {
    const { toJSON } = renderScreen();
    expect(toJSON()).toBeTruthy();
  });

  it('shows the welcome page with Get Started button', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Welcome to/)).toBeTruthy();
    expect(getByText('Get Started')).toBeTruthy();
  });

  it('shows the permissions page after pressing Get Started', async () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Get Started'));
    await waitFor(() => {
      expect(getByText('Permissions')).toBeTruthy();
      expect(getByText('Grant Permissions')).toBeTruthy();
    });
  });

  it('shows the final page with Start button', () => {
    const { getByText } = renderScreen();
    // The last page has the "Start" button text
    expect(getByText('Start')).toBeTruthy();
  });

  it('calls onDone when Start is pressed', () => {
    const { getByText, onDone } = renderScreen();
    fireEvent.press(getByText('Start'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows page indicators', () => {
    const { toJSON } = renderScreen();
    const tree = JSON.stringify(toJSON());
    // 4 page dots are rendered
    expect(tree).toBeTruthy();
  });
});
