import * as Linking from 'expo-linking';
import { linking } from '../linking';

// #785, part of #629: expo-linking was installed but never imported, and no
// NavigationContainer configured a `linking=` prop — deep links had no URL
// scheme to land on. This proves the scheme is actually wired up: the
// dev-client prefix comes from Linking.createURL('/'), and the production
// custom scheme ('iostoandroid://') matches app.json's `expo.scheme`.

describe('navigation linking config (#785)', () => {
  it('includes the custom "iostoandroid://" scheme as a prefix', () => {
    expect(linking.prefixes).toContain('iostoandroid://');
  });

  it('includes the dev-client prefix from Linking.createURL', () => {
    expect(linking.prefixes).toContain(Linking.createURL('/'));
  });

  it('does not expose any screen as a deep-link target yet (mechanism only)', () => {
    expect(linking.config).toBeUndefined();
  });
});
