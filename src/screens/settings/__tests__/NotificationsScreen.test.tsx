import React from 'react';
import { render, fireEvent, within } from '../../../test-utils';
import { NotificationsScreen } from '../NotificationsScreen';

const mockUpdate = jest.fn();

const baseSettings = {
  notificationsEnabled: false,
  notificationSounds: true,
  notificationBadges: false,
  notificationPreviews: 'always' as const,
  scheduledSummaryIdx: 0,
};

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: baseSettings, update: mockUpdate })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function switchForRow(root: ReturnType<typeof render>, title: string) {
  const textNode = root.getByText(title);
  let node: unknown = textNode.parent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  while (node && !(within as any)(node).queryByRole('switch')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node = (node as any).parent;
  }
  if (!node) throw new Error(`No switch found for row "${title}"`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (within as any)(node).getByRole('switch');
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { ...baseSettings },
      update: mockUpdate,
    });
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<NotificationsScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders exactly three toggles (Allow Notifications, Sounds, Badges)', () => {
    const { getAllByRole } = render(<NotificationsScreen navigation={mockNavigation as never} />);
    expect(getAllByRole('switch')).toHaveLength(3);
  });

  it('Allow Notifications switch is wired to notificationsEnabled', () => {
    const root = render(<NotificationsScreen navigation={mockNavigation as never} />);
    fireEvent.press(switchForRow(root, 'Allow Notifications'));
    expect(mockUpdate).toHaveBeenCalledWith('notificationsEnabled', true);
  });

  it('Sounds switch is wired to notificationSounds (independent of other rows)', () => {
    const root = render(<NotificationsScreen navigation={mockNavigation as never} />);
    fireEvent.press(switchForRow(root, 'Sounds'));
    expect(mockUpdate).toHaveBeenCalledWith('notificationSounds', false);
    expect(mockUpdate).not.toHaveBeenCalledWith('notificationBadges', expect.anything());
  });

  it('Badges switch is wired to notificationBadges (independent of other rows)', () => {
    const root = render(<NotificationsScreen navigation={mockNavigation as never} />);
    fireEvent.press(switchForRow(root, 'Badges'));
    expect(mockUpdate).toHaveBeenCalledWith('notificationBadges', true);
    expect(mockUpdate).not.toHaveBeenCalledWith('notificationsEnabled', expect.anything());
  });
});
