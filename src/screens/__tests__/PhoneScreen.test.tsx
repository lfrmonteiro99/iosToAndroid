import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { PhoneScreen } from '../PhoneScreen';
import * as DeviceStore from '../../store/DeviceStore';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockNav = { goBack: jest.fn() } as any;

describe('PhoneScreen', () => {
  it('renders Phone title', () => {
    const { getByText } = render(<PhoneScreen navigation={mockNav} />);
    expect(getByText('Phone')).toBeTruthy();
  });

  it('renders segmented control with 5 tabs', () => {
    const { getByText } = render(<PhoneScreen navigation={mockNav} />);
    expect(getByText('Favorites')).toBeTruthy();
    expect(getByText('Recents')).toBeTruthy();
    expect(getByText('Contacts')).toBeTruthy();
    expect(getByText('Keypad')).toBeTruthy();
    expect(getByText('Voicemail')).toBeTruthy();
  });

  it('keypad tab renders number buttons', () => {
    const { getByText } = render(<PhoneScreen navigation={mockNav} />);
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

  it('contacts tab list uses insets.bottom (34) + 20 = 54 for paddingBottom', () => {
    // jest.setup.js mocks useSafeAreaInsets → bottom: 34
    // Provide one contact so ContactsTab renders the FlatList instead of the empty state
    jest.spyOn(DeviceStore, 'useDevice').mockReturnValue({
      contacts: [{ id: '1', firstName: 'Ana', lastName: 'Silva', phone: '+351910000001' }],
    } as ReturnType<typeof DeviceStore.useDevice>);

    const { getByText, getByTestId } = render(<PhoneScreen navigation={mockNav} />);
    fireEvent.press(getByText('Contacts'));
    const list = getByTestId('contacts-list');
    expect(list.props.contentContainerStyle.paddingBottom).toBe(54);
  });

  it('keypad shows typed number', () => {
    const { getByText, getByLabelText } = render(<PhoneScreen navigation={mockNav} />);
    fireEvent.press(getByText('Keypad'));

    // Press digit buttons via accessibilityLabel
    fireEvent.press(getByLabelText('1'));
    fireEvent.press(getByLabelText('2'));
    fireEvent.press(getByLabelText('3'));

    // The display should show the typed number
    expect(getByText('123')).toBeTruthy();
  });
});
