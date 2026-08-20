import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { EditProfileScreen } from '../EditProfileScreen';
import type { AppNavigationProp } from '../../../navigation/types';

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

describe('EditProfileScreen', () => {
  it('pre-fills the fields from the stored profile', () => {
    const { getByText, getByPlaceholderText } = render(
      <EditProfileScreen navigation={makeNavigation()} />
    );

    expect(getByText('Edit Profile')).toBeTruthy();
    expect(getByPlaceholderText('Full Name').props.value).toBe('John Appleseed');
    expect(getByPlaceholderText('Email').props.value).toBe('john.appleseed@gmail.com');
  });

  it('keeps the typed name in the field and goes back on save', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    const nameField = getByPlaceholderText('Full Name');
    fireEvent.changeText(nameField, 'Jane Appleseed');
    expect(nameField.props.value).toBe('Jane Appleseed');

    fireEvent.press(getByText('Save'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid email: shows the error and does not go back', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    expect(queryByText('Invalid email format')).toBeNull();

    fireEvent.changeText(getByPlaceholderText('Email'), 'jane@@example');
    fireEvent.press(getByText('Save'));

    expect(getByText('Invalid email format')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('clears the email error as soon as the field is edited again', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'broken');
    fireEvent.press(getByText('Save'));
    expect(getByText('Invalid email format')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Email'), 'fixed@example.com');

    expect(queryByText('Invalid email format')).toBeNull();
  });

  it('accepts an empty email and saves', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), '');
    fireEvent.press(getByText('Save'));

    expect(queryByText('Invalid email format')).toBeNull();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('treats a whitespace-only email as empty and saves', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), '   ');
    fireEvent.press(getByText('Save'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('goes back without saving when Cancel is pressed', () => {
    const navigation = makeNavigation();
    const { getByText, getByPlaceholderText } = render(
      <EditProfileScreen navigation={navigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Full Name'), 'Discarded');
    fireEvent.press(getByText('Cancel'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('goes back twice when Save is pressed twice (no crash on a double tap)', () => {
    const navigation = makeNavigation();
    const { getByText } = render(<EditProfileScreen navigation={navigation} />);

    fireEvent.press(getByText('Save'));
    fireEvent.press(getByText('Save'));

    expect(navigation.goBack).toHaveBeenCalledTimes(2);
  });
});
