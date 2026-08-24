import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  signIn,
  signOut,
  getAccessToken,
  getInitialState,
} from '../GoogleAuth';

// The module under test imports `GoogleSignin` from the package; jest.setup.js
// provides a controllable mock. We drive that mock's functions per case so the
// suite exercises the REAL wrapper logic in GoogleAuth.ts (not a re-implementation).

const signedInUser = {
  user: {
    id: '1',
    name: 'Test User',
    email: 'user@gmail.com',
    photo: null,
    familyName: null,
    givenName: 'Test',
  },
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  idToken: 'id-token',
  serverAuthCode: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (GoogleSignin.hasPreviousSignIn as jest.Mock).mockReturnValue(false);
  (GoogleSignin.getCurrentUser as jest.Mock).mockReturnValue(null);
  (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'success', data: signedInUser });
  (GoogleSignin.signOut as jest.Mock).mockResolvedValue(null);
  (GoogleSignin.getTokens as jest.Mock).mockResolvedValue({
    idToken: 'id-token',
    accessToken: 'access-token-123',
  });
});

describe('signIn', () => {
  it('returns isSignedIn:true and the connected email on success', async () => {
    const state = await signIn();
    expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ isSignedIn: true, email: 'user@gmail.com' });
  });

  it('returns isSignedIn:false (does NOT throw) when the flow is cancelled', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'cancelled', data: null });
    const state = await signIn();
    expect(state).toEqual({ isSignedIn: false, email: null });
  });
});

describe('signOut', () => {
  it('delegates to the native signOut', async () => {
    await signOut();
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('getAccessToken', () => {
  it('returns the token when the user is signed in', async () => {
    (GoogleSignin.hasPreviousSignIn as jest.Mock).mockReturnValue(true);
    const token = await getAccessToken();
    expect(GoogleSignin.getTokens).toHaveBeenCalledTimes(1);
    expect(token).toBe('access-token-123');
  });

  it('returns null (never throws) when no user is signed in', async () => {
    (GoogleSignin.hasPreviousSignIn as jest.Mock).mockReturnValue(false);
    const token = await getAccessToken();
    expect(token).toBeNull();
    expect(GoogleSignin.getTokens).not.toHaveBeenCalled();
  });

  it('returns null (swallows) when getTokens rejects, instead of throwing', async () => {
    (GoogleSignin.hasPreviousSignIn as jest.Mock).mockReturnValue(true);
    (GoogleSignin.getTokens as jest.Mock).mockRejectedValue(new Error('network down'));
    const token = await getAccessToken();
    expect(token).toBeNull();
  });
});

describe('getInitialState', () => {
  it('reflects the signed-in state read from getCurrentUser', () => {
    (GoogleSignin.getCurrentUser as jest.Mock).mockReturnValue(signedInUser);
    expect(getInitialState()).toEqual({ isSignedIn: true, email: 'user@gmail.com' });
  });

  it('reflects signed-out state when getCurrentUser is null', () => {
    (GoogleSignin.getCurrentUser as jest.Mock).mockReturnValue(null);
    expect(getInitialState()).toEqual({ isSignedIn: false, email: null });
  });
});
