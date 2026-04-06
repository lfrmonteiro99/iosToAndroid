import React from 'react';
import { render } from '../../test-utils';
import { MessagesScreen } from '../MessagesScreen';

describe('MessagesScreen', () => {
  it('renders Messages title', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText('Messages')).toBeTruthy();
  });

  it('shows permission button when no messages', () => {
    // Device messages are empty in test environment (mock returns [])
    const { getByText } = render(<MessagesScreen />);
    expect(getByText('Grant SMS Permission')).toBeTruthy();
  });

  it('renders compose button', () => {
    const { getByLabelText } = render(<MessagesScreen />);
    expect(getByLabelText('Compose new message')).toBeTruthy();
  });
});
