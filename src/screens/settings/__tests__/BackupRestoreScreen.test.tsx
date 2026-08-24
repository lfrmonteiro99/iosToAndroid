import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';
import { AlertProvider } from '../../../components/AlertProvider';

// We mock the GoogleAuth service so the screen's conditional rendering and
// sign-in/sign-out dispatch are tested against the REAL screen component,
// not the native module. Two states are exercised: signed out (default) and
// signed in (override).
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockGetInitialState = jest.fn();

jest.mock('../../../services/GoogleAuth', () => ({
  getInitialState: (...args: unknown[]) => mockGetInitialState(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function renderScreen() {
  return render(
    <AlertProvider>
      <BackupRestoreScreen navigation={mockNavigation as never} />
    </AlertProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInitialState.mockReturnValue({ isSignedIn: false, email: null });
  mockSignIn.mockResolvedValue({ isSignedIn: true, email: 'user@gmail.com' });
  mockSignOut.mockResolvedValue(undefined);
});

describe('BackupRestoreScreen — Google Drive section', () => {
  it('shows the "Connect Google Drive" action when signed out', () => {
    const { getByText } = renderScreen();
    expect(getByText('Connect Google Drive')).toBeTruthy();
    expect(getByText('Back up to your private Drive app folder')).toBeTruthy();
  });

  it('shows the connected account email when signed in', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    const { getByText } = renderScreen();
    expect(getByText('Connected: user@gmail.com')).toBeTruthy();
    expect(getByText('Tap to disconnect')).toBeTruthy();
  });

  it('calls signIn() when the Connect tile is tapped while signed out', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Connect Google Drive'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('calls signOut() when the connected tile is tapped while signed in', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Connected: user@gmail.com'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('seeds the signed-in state from getInitialState on mount (no signIn call)', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    renderScreen();
    expect(mockGetInitialState).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // Regression guard: the existing Export/Import/Reset behaviour must be wholly
  // unchanged by the additive Google Drive section.
  it('still renders the Export, Import, and Reset tiles', () => {
    const { getByText } = renderScreen();
    expect(getByText('Export Settings')).toBeTruthy();
    expect(getByText('Import Settings')).toBeTruthy();
    expect(getByText('Reset All Settings')).toBeTruthy();
  });

  it('opens the export disclosure dialog when Export Settings is tapped', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Export Settings'));
    expect(getByText(/copies your app preferences/i)).toBeTruthy();
  });
});
