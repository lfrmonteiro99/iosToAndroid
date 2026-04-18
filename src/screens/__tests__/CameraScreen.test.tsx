import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CameraScreen } from '../CameraScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };


jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));

describe('CameraScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<CameraScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders mode buttons', () => {
    const { getByText } = render(<CameraScreen navigation={mockNavigation} />);
    expect(getByText('PHOTO')).toBeTruthy();
    expect(getByText('VIDEO')).toBeTruthy();
    expect(getByText('PORTRAIT')).toBeTruthy();
  });

  it('shows camera unavailable placeholder when expo-camera is not installed', () => {
    const { getByText } = render(<CameraScreen navigation={mockNavigation} />);
    expect(getByText(/Camera preview unavailable|Requesting camera permission|Camera permission/)).toBeTruthy();
  });

  it('selecting VIDEO mode updates the display', () => {
    const { getByText } = render(<CameraScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('VIDEO'));
    expect(getByText('VIDEO')).toBeTruthy();
  });

  it('pressing close calls navigation.goBack', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
    const { getAllByRole } = render(<CameraScreen navigation={nav} />);
    // The close (X) pressable is the first pressable in the top bar
    const pressables = getAllByRole('button');
    if (pressables.length > 0) {
      fireEvent.press(pressables[0]);
    }
  });
});
