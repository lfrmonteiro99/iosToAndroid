import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { PrivacyScreen } from '../PrivacyScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

const mockUpdate = jest.fn();

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: {
      locationServices: false,
    },
    update: mockUpdate,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('PrivacyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Report location as denied so any "Request" button logic is triggered
    launcherMock.checkPermissions.mockResolvedValue({ location: false });
  });

  it('renders without crashing', async () => {
    const { toJSON } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('does not show Share Analytics or Personalized Ads toggles', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    expect(queryByText('Share Analytics')).toBeNull();
    expect(queryByText('Personalized Ads')).toBeNull();
  });

  it('does not show Allow Apps to Request to Track toggle', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    expect(queryByText('Allow Apps to Request to Track')).toBeNull();
  });

  // Red step: before fix, with locationServices=false the location row still shows
  // a "Request" button and shows "Denied" status — the toggle has no effect on the UI.
  // After fix: location row shows "Disabled by user" and has no Request button.
  it('hides Request button for location when locationServices is off', async () => {
    const { queryAllByText, queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    // Wait for checkPermissions to resolve (location: false → row gets real data)
    await waitFor(() => {
      expect(launcherMock.checkPermissions).toHaveBeenCalled();
    });

    // With locationServices=false: no "Denied" for location and no "Request" for location
    // The row should show "Disabled by user" (controlled by the toggle gate)
    expect(queryByText('Denied')).toBeNull();
    // And no Request buttons should be visible for the location row
    const requestButtons = queryAllByText('Request');
    expect(requestButtons).toHaveLength(0);
  });
});
