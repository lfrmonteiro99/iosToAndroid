import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { PhoneScreen } from '../PhoneScreen';

describe('PhoneScreen', () => {
  it('renders Phone title', () => {
    const { getByText } = render(<PhoneScreen navigation={{ goBack: jest.fn() } as any} />);
    expect(getByText('Phone')).toBeTruthy();
  });

  it('renders segmented control with 5 tabs', () => {
    const { getByText } = render(<PhoneScreen navigation={{ goBack: jest.fn() } as any} />);
    expect(getByText('Favorites')).toBeTruthy();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Contacts')).toBeTruthy();
    expect(getByText('Keypad')).toBeTruthy();
    expect(getByText('Voicemail')).toBeTruthy();
  });

  it('keypad tab renders number buttons', () => {
    const { getByText, getAllByText } = render(<PhoneScreen navigation={{ goBack: jest.fn() } as any} />);
    // Switch to Keypad tab (index 3)
    fireEvent.press(getByText('Keypad'));

    // Verify digit buttons are rendered
    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
    expect(getByText('6')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText('8')).toBeTruthy();
    expect(getByText('9')).toBeTruthy();
    expect(getByText('0')).toBeTruthy();
    expect(getByText('*')).toBeTruthy();
    expect(getByText('#')).toBeTruthy();
  });

  it('keypad shows typed number', () => {
    const { getByText, getByLabelText } = render(<PhoneScreen navigation={{ goBack: jest.fn() } as any} />);
    fireEvent.press(getByText('Keypad'));

    // Press digit buttons via accessibilityLabel
    fireEvent.press(getByLabelText('1'));
    fireEvent.press(getByLabelText('2'));
    fireEvent.press(getByLabelText('3'));

    // The display should show the typed number
    expect(getByText('123')).toBeTruthy();
  });
});
