import React from 'react';
import { render } from '../../test-utils';
import { MessagesScreen } from '../MessagesScreen';

describe('MessagesScreen', () => {
  it('renders Messages title', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText('Messages')).toBeTruthy();
  });

  it('renders compose button', () => {
    const { getByLabelText } = render(<MessagesScreen />);
    expect(getByLabelText('Compose new message')).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<MessagesScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
