import React from 'react';
import { render } from '../../../test-utils';
import { PrivacyScreen } from '../PrivacyScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: { locationServices: false },
    update: jest.fn(),
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// #635-SI1 — PrivacyScreen must never promise per-app access counts or a 30-day
// window that the native data (LauncherModule) does not provide. The "Privacy
// Monitor" tile from qa/issue-635 (tip cc38ed6) shipped subtitle="Acessos por
// app nos últimos 30 dias", which described data the app does not have. This
// guard fails if that misleading copy (or a "Privacy Monitor" tile) ever lands
// on dev, so the false claim cannot be reintroduced silently by a merge.
describe('PrivacyScreen — honest privacy copy (#635-SI1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    launcherMock.checkPermissions.mockResolvedValue({ location: false });
  });

  it('does not render the "Privacy Monitor" tile', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    expect(queryByText('Privacy Monitor')).toBeNull();
  });

  it('does not claim per-app access counts anywhere on the screen', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    expect(queryByText('Acessos por app nos últimos 30 dias')).toBeNull();
  });

  it('does not mention a 30-day access window in any visible text', () => {
    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    // Catches both "30 dias" / "últimos 30 dias" phrasing used by issue-635.
    expect(queryByText(/30\s*dias/i)).toBeNull();
  });
});
