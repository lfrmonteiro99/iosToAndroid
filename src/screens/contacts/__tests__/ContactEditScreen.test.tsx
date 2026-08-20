import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { ContactEditScreen } from '../ContactEditScreen';
import type { AppNavigationProp, AppRouteProp } from '../../../navigation/types';

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

function makeRoute(params: { contactId?: string } | undefined): AppRouteProp<'ContactEdit'> {
  return {
    key: 'ContactEdit-test',
    name: 'ContactEdit',
    params,
  } as AppRouteProp<'ContactEdit'>;
}

describe('ContactEditScreen', () => {
  describe('create mode (no contactId)', () => {
    it('renders the New Contact title with empty fields', () => {
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={makeNavigation()} route={makeRoute(undefined)} />
      );

      expect(getByText('New Contact')).toBeTruthy();
      expect(getByPlaceholderText('First Name').props.value).toBe('');
      expect(getByPlaceholderText('Last Name').props.value).toBe('');
    });

    it('does not save (goBack) while required fields are incomplete', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute(undefined)} />
      );

      // Only a first name — last name and phone still missing → canSave false.
      fireEvent.changeText(getByPlaceholderText('First Name'), 'New');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('saves and goes back once all required fields are valid', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute(undefined)} />
      );

      fireEvent.changeText(getByPlaceholderText('First Name'), 'New');
      fireEvent.changeText(getByPlaceholderText('Last Name'), 'Person');
      fireEvent.changeText(getByPlaceholderText('Phone'), '5551234567');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('blocks save when the phone has too few digits', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute(undefined)} />
      );

      fireEvent.changeText(getByPlaceholderText('First Name'), 'New');
      fireEvent.changeText(getByPlaceholderText('Last Name'), 'Person');
      fireEvent.changeText(getByPlaceholderText('Phone'), '123'); // < 7 digits
      fireEvent.press(getByText('Done'));

      expect(getByText('Enter a valid phone number (at least 7 digits)')).toBeTruthy();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('blocks save on an invalid email even when name and phone are valid', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute(undefined)} />
      );

      fireEvent.changeText(getByPlaceholderText('First Name'), 'New');
      fireEvent.changeText(getByPlaceholderText('Last Name'), 'Person');
      fireEvent.changeText(getByPlaceholderText('Phone'), '5551234567');
      fireEvent.changeText(getByPlaceholderText('Email'), 'not-an-email');
      fireEvent.press(getByText('Done'));

      expect(getByText('Invalid email address')).toBeTruthy();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });

  describe('edit mode (contactId present)', () => {
    it('renders the Edit Contact title pre-filled from the seeded contact', () => {
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={makeNavigation()} route={makeRoute({ contactId: '1' })} />
      );

      // Seed id '1' is Alice Anderson.
      expect(getByText('Edit Contact')).toBeTruthy();
      expect(getByPlaceholderText('First Name').props.value).toBe('Alice');
      expect(getByPlaceholderText('Last Name').props.value).toBe('Anderson');
      expect(getByPlaceholderText('Phone').props.value).toBe('+1 (555) 100-0001');
    });

    it('saves an edited field and goes back', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute({ contactId: '1' })} />
      );

      fireEvent.changeText(getByPlaceholderText('First Name'), 'Alicia');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('does not save when a required field is cleared in edit mode', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <ContactEditScreen navigation={navigation} route={makeRoute({ contactId: '1' })} />
      );

      fireEvent.changeText(getByPlaceholderText('First Name'), '');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });
});
