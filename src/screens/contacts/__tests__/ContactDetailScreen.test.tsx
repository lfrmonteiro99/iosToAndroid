import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { ContactDetailScreen } from '../ContactDetailScreen';
import type { AppNavigationProp, AppRouteProp } from '../../../navigation/types';

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

function makeRoute(contactId: string): AppRouteProp<'ContactDetail'> {
  return {
    key: 'ContactDetail-test',
    name: 'ContactDetail',
    params: { contactId },
  } as AppRouteProp<'ContactDetail'>;
}

describe('ContactDetailScreen', () => {
  it('renders the seeded contact for a known contactId', () => {
    const { getAllByText, getByText } = render(
      <ContactDetailScreen navigation={makeNavigation()} route={makeRoute('1')} />
    );

    // Seed id '1' is Alice Anderson (src/store/ContactsStore.tsx)
    expect(getAllByText('Alice Anderson').length).toBeGreaterThan(0);
    expect(getByText('Anderson & Co')).toBeTruthy();
    expect(getByText('+1 (555) 100-0001')).toBeTruthy();
    expect(getByText('alice.anderson@email.com')).toBeTruthy();
  });

  it('renders the not-found branch for an unknown contactId', () => {
    const { getByText, queryByText } = render(
      <ContactDetailScreen navigation={makeNavigation()} route={makeRoute('does-not-exist')} />
    );

    expect(getByText('Contact not found.')).toBeTruthy();
    // Inverse of the found branch: none of the contact chrome renders.
    expect(queryByText('Alice Anderson')).toBeNull();
    expect(queryByText('Delete Contact')).toBeNull();
    expect(queryByText('Edit')).toBeNull();
  });

  it('renders the not-found branch for an empty contactId', () => {
    const { getByText } = render(
      <ContactDetailScreen navigation={makeNavigation()} route={makeRoute('')} />
    );

    expect(getByText('Contact not found.')).toBeTruthy();
  });

  it('navigates to ContactEdit with the routed contactId when Edit is pressed', () => {
    const navigation = makeNavigation();
    const { getByText } = render(
      <ContactDetailScreen navigation={navigation} route={makeRoute('3')} />
    );

    fireEvent.press(getByText('Edit'));

    expect(navigation.navigate).toHaveBeenCalledWith('ContactEdit', { contactId: '3' });
  });

  it('navigates to Conversation with the contact phone when message is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <ContactDetailScreen navigation={navigation} route={makeRoute('1')} />
    );

    fireEvent.press(getByLabelText('message'));

    expect(navigation.navigate).toHaveBeenCalledWith('Conversation', {
      address: '+1 (555) 100-0001',
    });
  });

  it('does not navigate to Mail for a contact without an email', () => {
    const navigation = makeNavigation();
    // Seed id '4' (Diana Davis) has no email.
    const { getByLabelText } = render(
      <ContactDetailScreen navigation={navigation} route={makeRoute('4')} />
    );

    fireEvent.press(getByLabelText('mail'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('goes back only after the delete alert is confirmed', () => {
    const navigation = makeNavigation();
    const { getByText, getAllByText } = render(
      <ContactDetailScreen navigation={navigation} route={makeRoute('2')} />
    );

    fireEvent.press(getByText('Delete Contact'));
    // Opening the alert alone must not pop the screen.
    expect(navigation.goBack).not.toHaveBeenCalled();

    // Inside the dialog the confirm button is labelled exactly 'Delete'.
    const confirm = getAllByText('Delete');
    fireEvent.press(confirm[confirm.length - 1]);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
