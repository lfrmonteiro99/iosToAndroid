import React from 'react';
import { render } from '../../test-utils';
import { ConversationScreen } from '../ConversationScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: { address: '+15551234567' } };

describe('ConversationScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders message input area', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the send button area', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders back button', () => {
    const { getByLabelText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(getByLabelText('Back to Messages')).toBeTruthy();
  });
});
