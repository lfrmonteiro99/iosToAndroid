import React from 'react';
import { render } from '../../../test-utils';
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

describe('PrivacyScreen — per-app access count platform limitation (#624-S2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    launcherMock.checkPermissions.mockResolvedValue({ location: false });
  });

  // RED: before the fix there is no explanation anywhere on the screen that
  // third-party apps cannot count per-app sensor access on Android — nothing
  // in the App Privacy section mentions the signature-only permission or the
  // Android 12 floor for the real system panel.
  it('shows a disclaimer that per-app access counts require a signature-only permission', () => {
    const { getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    const disclaimer = getByText(/signature-only/i);
    expect(disclaimer).toBeTruthy();
  });

  it('disclaimer mentions the Android 12+ floor for the native panel', () => {
    const { getAllByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    const disclaimers = getAllByText(/Android 12/);
    expect(disclaimers.length).toBeGreaterThan(0);
  });

  // Inverse of the fix: no per-app access COUNT (e.g. "12×", "4 times") is ever
  // rendered as if it were real data — the screen only shows granted/denied
  // status, never a synthesized access tally.
  it('never renders a fabricated per-app access count', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    expect(queryByText(/\d+×/)).toBeNull();
    expect(queryByText(/\d+ times/i)).toBeNull();
  });
});
