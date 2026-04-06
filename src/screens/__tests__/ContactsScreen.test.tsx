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

  it('shows permission button when no contacts', () => {
    // Device contacts are empty in test environment (mock returns [])
    const { getByText } = render(<ContactsScreen />);
    expect(getByText('Grant Contacts Permission')).toBeTruthy();
  });
});
