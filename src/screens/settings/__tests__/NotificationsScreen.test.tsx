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

type TestNode = { parent: TestNode | null };
function switchForRow(root: ReturnType<typeof render>, title: string) {
  let node: TestNode | null = root.getByText(title) as unknown as TestNode;
  while (node && !within(node as never).queryByRole('switch')) {
    node = node.parent;
  }
  if (!node) throw new Error('No switch found for row "' + title + '"');
  return within(node as never).getByRole('switch');
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
