import React from 'react';
import { render, waitFor, fireEvent } from '../../../test-utils';
import { PrivacyMonitorScreen } from '../PrivacyMonitorScreen';
import { AlertProvider } from '../../../components/AlertProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function renderScreen() {
  return render(
    <AlertProvider>
      <PrivacyMonitorScreen navigation={mockNavigation as never} />
    </AlertProvider>,
  );
}

const REPORT = {
  generatedAt: 1,
  sensors: [
    {
      sensor: 'camera',
      label: 'Camera',
      icon: 'camera',
      bg: '#1C1C1E',
      totalAccesses: 16,
      appCount: 2,
      topApps: [
        { packageName: 'com.instagram', appName: 'Instagram', count: 12 },
        { packageName: 'com.whatsapp', appName: 'WhatsApp', count: 4 },
      ],
    },
    {
      sensor: 'microphone',
      label: 'Microphone',
      icon: 'mic',
      bg: '#FF2D55',
      totalAccesses: 0,
      appCount: 0,
      topApps: [],
    },
    {
      sensor: 'location',
      label: 'Location',
      icon: 'location',
      bg: '#007AFF',
      totalAccesses: 7,
      appCount: 1,
      topApps: [{ packageName: 'com.maps', appName: 'Maps', count: 7 }],
    },
    {
      sensor: 'network',
      label: 'Network',
      icon: 'globe',
      bg: '#34C759',
      totalAccesses: 3,
      appCount: 1,
      topApps: [{ packageName: 'com.browser', appName: 'Browser', count: 3 }],
    },
  ],
};

describe('PrivacyMonitorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    launcherMock.getPrivacyReport.mockResolvedValue(REPORT);
  });

  it('renders one card per sensor with the total access count', async () => {
    const { findByText } = renderScreen();
    // Camera card shows the aggregated total
    expect(await findByText('Camera')).toBeTruthy();
    expect(await findByText('Microphone')).toBeTruthy();
    expect(await findByText('Location')).toBeTruthy();
    expect(await findByText('Network')).toBeTruthy();
    // Total = 16 + 0 + 7 + 3 (sum of per-sensor totals = apps with permission)
    expect(await findByText('26 apps com permissão de sensor')).toBeTruthy();
  });

  it('hides the per-app breakdown until the card is expanded', async () => {
    const { findByText, queryByText } = renderScreen();
    await findByText('Camera');

    // Collapsed: Instagram should NOT appear yet (only after expand)
    expect(queryByText('Instagram')).toBeNull();

    // Expand the Camera card
    fireEvent.press(await findByText('Camera'));

    await waitFor(() => {
      expect(queryByText('Instagram')).toBeTruthy();
    });
    // Breakdown lists each app by name; no "×" multiplier.
    expect(queryByText('Instagram')).toBeTruthy();
    expect(queryByText('WhatsApp')).toBeTruthy();
    expect(queryByText('12×')).toBeNull();
    expect(queryByText('4×')).toBeNull();
  });

  it('shows a no-accesses message for a sensor with no apps', async () => {
    const { findByText, queryByText } = renderScreen();
    await findByText('Microphone');
    fireEvent.press(await findByText('Microphone'));
    await waitFor(() => {
      expect(queryByText('Nenhuma app com permissão registada.')).toBeTruthy();
    });
  });

  it('removes the meaningless per-app ratio bars from the breakdown (#635-SI4)', async () => {
    const { findByText, queryByLabelText, queryByText } = renderScreen();
    await findByText('Camera');
    fireEvent.press(await findByText('Camera'));

    await waitFor(() => {
      expect(queryByText('Instagram')).toBeTruthy();
    });

    // The breakdown still lists each app by name (no "×" multiplier).
    expect(queryByText('WhatsApp')).toBeTruthy();
    expect(queryByText('12×')).toBeNull();
    expect(queryByText('4×')).toBeNull();

    // No per-app ratio bar: the vague "app com permissão" bar label is gone.
    // (On the buggy build each row rendered a 100%-wide bar with this label.)
    expect(queryByLabelText('Instagram: app com permissão')).toBeNull();
    expect(queryByLabelText('WhatsApp: app com permissão')).toBeNull();

    // The package name is now shown inline (grey) instead of a width-derived bar.
    expect(queryByText('com.instagram')).toBeTruthy();
    expect(queryByText('com.whatsapp')).toBeTruthy();
  });

  it('navigates back to Privacy via the header button', async () => {
    const { findByText } = renderScreen();
    fireEvent.press(await findByText('Privacidade'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('renders the loading state before the report resolves', () => {
    launcherMock.getPrivacyReport.mockReturnValue(new Promise(() => {}));
    const { queryByText } = renderScreen();
    expect(queryByText('A carregar…')).toBeTruthy();
  });
});
