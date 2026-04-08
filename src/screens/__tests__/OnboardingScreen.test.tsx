import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { OnboardingScreen } from '../OnboardingScreen';

describe('OnboardingScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<OnboardingScreen onDone={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders welcome title on first page', () => {
    const { getByText } = render(<OnboardingScreen onDone={jest.fn()} />);
    expect(getByText(/Welcome to/i)).toBeTruthy();
  });

  it('renders Get Started button on first page', () => {
    const { getByText } = render(<OnboardingScreen onDone={jest.fn()} />);
    expect(getByText('Get Started')).toBeTruthy();
  });

  it('Get Started reveals the Permissions page', async () => {
    const { getByText } = render(<OnboardingScreen onDone={jest.fn()} />);
    await act(async () => {
      fireEvent.press(getByText('Get Started'));
    });
    expect(getByText('Permissions')).toBeTruthy();
  });

  it('calls onDone when Start is pressed', async () => {
    const onDone = jest.fn();
    const { getByText } = render(<OnboardingScreen onDone={onDone} />);
    // Navigate to page 2
    await act(async () => { fireEvent.press(getByText('Get Started')); });
    // Navigate to page 3 (grant permissions moves to start)
    await act(async () => { fireEvent.press(getByText('Grant Permissions')); });
    await act(async () => { fireEvent.press(getByText('Start')); });
    expect(onDone).toHaveBeenCalled();
  });
});
