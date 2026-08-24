import { GoogleSignin } from '@react-native-google-signin/google-signin';

// ── Build-time configuration ──────────────────────────────────────────────────
//
// The OAuth client id is BUILD-TIME configuration, NOT a secret to hardcode as a
// real value in a committed file. The placeholder below is replaced per
// environment at build time (e.g. via an untracked google-services.json, already
// excluded like other native build artifacts, or an env-injected value).
// The real web client id must be supplied there — never committed.
//
// The Drive `appdata` scope grants access ONLY to the app's own hidden
// Application Data folder (https://www.googleapis.com/auth/drive.appdata),
// NOT the user's general Drive. That is the minimum scope the cloud-backup
// path (#126 follow-up) needs to read/write the backup blob.
export const GOOGLE_WEB_CLIENT_ID = 'REPLACE_WITH_YOUR_WEB_CLIENT_ID';
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  scopes: GOOGLE_SCOPES,
  offlineAccess: true,
});

export interface GoogleAuthState {
  isSignedIn: boolean;
  email: string | null;
}

/**
 * Signs the user in via the native Google Sign-In module. Returns the resulting
 * auth state. A cancelled flow (user dismisses the sheet) resolves to a
 * signed-out state rather than throwing, so callers can treat it uniformly.
 */
export async function signIn(): Promise<GoogleAuthState> {
  const res = await GoogleSignin.signIn();
  if (res.type === 'success') {
    return { isSignedIn: true, email: res.data.user.email };
  }
  // type === 'cancelled'
  return { isSignedIn: false, email: null };
}

/** Signs the user out. Resolves when the native module confirms. */
export async function signOut(): Promise<void> {
  await GoogleSignin.signOut();
}

/**
 * Returns a fresh OAuth access token, or `null` when the user is not signed in.
 * Never throws for the not-signed-in case — that is the contract the screen
 * relies on to decide whether to show the "Connect" action.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!GoogleSignin.hasPreviousSignIn()) {
    return null;
  }
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch {
    return null;
  }
}

/**
 * Synchronous snapshot of the current sign-in state, read from the module's
 * in-memory user. Used to seed the screen's UI on mount without a round-trip.
 */
export function getInitialState(): GoogleAuthState {
  const user = GoogleSignin.getCurrentUser();
  return { isSignedIn: !!user, email: user?.user.email ?? null };
}
