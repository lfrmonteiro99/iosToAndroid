import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { ThemeProvider } from './theme/ThemeContext';
import { SettingsProvider } from './store/SettingsStore';
import { ContactsProvider } from './store/ContactsStore';
import { ProfileProvider } from './store/ProfileStore';
import { AppsProvider } from './store/AppsStore';
import { DeviceProvider } from './store/DeviceStore';
import { FoldersProvider } from './store/FoldersStore';
import { BookmarksProvider } from './store/BookmarksStore';
import { LocationProvider } from './store/LocationStore';
import { ReadingListProvider } from './store/ReadingListStore';
import { HealthProvider } from './store/HealthStore';
import { WalletProvider } from './store/WalletStore';

// gateFirstRender={false} on the two gated providers.
//
// Both normally hold back their first render until an async AsyncStorage read
// finishes (and, for settings, an initial device sync), so the app never flashes
// default settings or the wrong theme on launch. `render` below is SYNCHRONOUS, so
// with the gate on the entire subtree comes back as `null` and every query fails
// with "Unable to find an element with text: ..." — that single mechanism was
// responsible for 103 of 180 test failures across 24 suites.
//
// The gate is app-shell launch behaviour and belongs in its own test; these tests
// are about what the screens render once settings exist.
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender={false}>
      <ThemeProvider gateFirstRender={false}>
        <ContactsProvider>
          <ProfileProvider>
            <AppsProvider>
              <DeviceProvider>
                <FoldersProvider>
                  <BookmarksProvider>
                  <LocationProvider>
                    <ReadingListProvider>
                      <WalletProvider>
                        <HealthProvider>
                          {children}
                        </HealthProvider>
                      </WalletProvider>
                    </ReadingListProvider>
                  </LocationProvider>
                  </BookmarksProvider>
                </FoldersProvider>
              </DeviceProvider>
            </AppsProvider>
          </ProfileProvider>
        </ContactsProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
export { customRender as render };
