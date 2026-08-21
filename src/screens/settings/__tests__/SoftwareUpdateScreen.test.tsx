import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { SoftwareUpdateScreen } from '../SoftwareUpdateScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: {
      automaticUpdates: false,
      updateAvailable: false,
    },
    update: jest.fn(),
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock global fetch
global.fetch = jest.fn();

describe('SoftwareUpdateScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: '1.19.0' }),
    });
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the Software Update title', () => {
    const { getByText } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    expect(getByText('Software Update')).toBeTruthy();
  });

  it('shows Current Version row', () => {
    const { getByText } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    expect(getByText('Current Version')).toBeTruthy();
  });

  it('shows Automatic Updates toggle', () => {
    const { getByText, getAllByRole } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    expect(getByText('Automatic Updates')).toBeTruthy();
    const switches = getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
  });

  it('shows Check Now button and can be pressed', () => {
    const { getByText } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    const checkButton = getByText('Check Now');
    expect(checkButton).toBeTruthy();
    fireEvent.press(checkButton);
  });

  it('displays checking state after Check Now is pressed', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          json: async () => ({ tag_name: '1.19.0' }),
        });
      }, 100);
    }));

    const { getByText, queryByText } = render(<SoftwareUpdateScreen navigation={mockNavigation} />);
    const checkButton = getByText('Check Now');
    fireEvent.press(checkButton);

    // Verify button shows "Checking…" while fetch is pending
    await waitFor(() => {
      expect(getByText('Checking…')).toBeTruthy();
    }, { timeout: 2000 });

    // Verify status card shows "Checking for updates…"
    await waitFor(() => {
      expect(queryByText(/Checking for updates/i)).toBeTruthy();
    }, { timeout: 2000 });

    // Verify it transitions back to "Check Now" after fetch completes
    await waitFor(() => {
      expect(getByText('Check Now')).toBeTruthy();
      expect(queryByText('Checking…')).toBeNull();
    }, { timeout: 2000 });
  });
});
