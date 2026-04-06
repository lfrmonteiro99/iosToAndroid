import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { ThemeProvider } from './theme/ThemeContext';
import { SettingsProvider } from './store/SettingsStore';
import { ContactsProvider } from './store/ContactsStore';
import { ProfileProvider } from './store/ProfileStore';
import { AppsProvider } from './store/AppsStore';
import { DeviceProvider } from './store/DeviceStore';
import { FoldersProvider } from './store/FoldersStore';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ContactsProvider>
          <ProfileProvider>
            <AppsProvider>
              <DeviceProvider>
                <FoldersProvider>
                  {children}
                </FoldersProvider>
              </DeviceProvider>
            </AppsProvider>
          </ProfileProvider>
        </ContactsProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
export { customRender as render };
