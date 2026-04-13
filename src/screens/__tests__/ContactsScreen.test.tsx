import React from 'react';
import { render } from '../../test-utils';
import { ContactsScreen } from '../ContactsScreen';

describe('ContactsScreen', () => {
  it('renders Contacts title', () => {
    const { getByText } = render(<ContactsScreen />);
    expect(getByText('Contacts')).toBeTruthy();
  });

  it('renders search bar', () => {
    const { getByPlaceholderText } = render(<ContactsScreen />);
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('shows permission button when no contacts after device store is ready', async () => {
    // Device contacts are empty in test environment (mock returns [])
    // DeviceStore sets isReady=true after its initial refresh effect completes.
    const { findByText } = render(<ContactsScreen />);
    const button = await findByText('Grant Contacts Permission', {}, { timeout: 3000 });
    expect(button).toBeTruthy();
  });
});
