import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { ProfileScreen } from '../ProfileScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the default profile name and email from ProfileStore', () => {
    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('John Appleseed')).toBeTruthy();
    expect(getByText('john.appleseed@gmail.com')).toBeTruthy();
  });

  it('shows the seeded contact and favorite counts', () => {
    const { getByText } = render(<ProfileScreen />);

    // 26 seeded contacts, 7 of them flagged isFavorite (src/store/ContactsStore.tsx).
    expect(getByText('Contacts')).toBeTruthy();
    expect(getByText('26')).toBeTruthy();
    expect(getByText('Favorites')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });

  it('navigates to EditProfile when the Edit Profile row is pressed', () => {
    const { getByText } = render(<ProfileScreen />);

    fireEvent.press(getByText('Edit Profile'));

    expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
  });

  it('keeps the sign-out dialog hidden until the row is pressed', () => {
    const { queryByText, getByText, getAllByText } = render(<ProfileScreen />);

    // Inverse of the fix: the confirmation copy is absent before the press.
    expect(
      queryByText('This will reset all settings, contacts, and profile data to defaults.')
    ).toBeNull();

    fireEvent.press(getByText('Sign Out'));

    expect(
      getByText('This will reset all settings, contacts, and profile data to defaults.')
    ).toBeTruthy();
    // The row plus the dialog title/action now share the label.
    expect(getAllByText('Sign Out').length).toBeGreaterThan(1);
  });

  it('dismisses the sign-out dialog on Cancel without resetting the profile', () => {
    const { getByText, queryByText } = render(<ProfileScreen />);

    fireEvent.press(getByText('Sign Out'));
    fireEvent.press(getByText('Cancel'));

    expect(
      queryByText('This will reset all settings, contacts, and profile data to defaults.')
    ).toBeNull();
    // Profile data untouched.
    expect(getByText('John Appleseed')).toBeTruthy();
  });

  it('opens the avatar action sheet on avatar press and closes it on Cancel', () => {
    const { getByLabelText, getByText, queryByText } = render(<ProfileScreen />);

    expect(queryByText('Take Photo')).toBeNull();

    fireEvent.press(getByLabelText('Change profile photo'));

    expect(getByText('Take Photo')).toBeTruthy();
    expect(getByText('Choose from Library')).toBeTruthy();
    expect(getByText('Remove Photo')).toBeTruthy();

    fireEvent.press(getByText('Cancel'));

    expect(queryByText('Take Photo')).toBeNull();
  });

  it('opens the share sheet when Share Profile is pressed', () => {
    const { getByText, getAllByText, queryByLabelText, getByLabelText } = render(<ProfileScreen />);

    // Inverse: the share sheet options are absent before the press.
    expect(queryByLabelText('Copy')).toBeNull();

    fireEvent.press(getByText('Share Profile'));

    // CupertinoShareSheet renders `title` in its preview card, so the name
    // now appears both on the profile header and inside the sheet.
    expect(getByLabelText('Copy')).toBeTruthy();
    expect(getAllByText('John Appleseed').length).toBe(2);
  });

  it('tolerates the avatar sheet being opened twice in a row', () => {
    const { getByLabelText, getByText } = render(<ProfileScreen />);

    fireEvent.press(getByLabelText('Change profile photo'));
    fireEvent.press(getByLabelText('Change profile photo'));

    expect(getByText('Take Photo')).toBeTruthy();
  });
});
