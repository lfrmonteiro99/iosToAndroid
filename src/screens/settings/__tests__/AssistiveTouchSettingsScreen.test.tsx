import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { AssistiveTouchSettingsScreen } from '../AssistiveTouchSettingsScreen';
import type { MenuItemId } from '../../../store/AssistiveTouchStore';

const mockUpdate = jest.fn();
const mockUseAssistive = jest.fn();

jest.mock('../../../store/AssistiveTouchStore', () => ({
  useAssistiveTouch: () => mockUseAssistive(),
  AssistiveTouchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function assistive(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    idleOpacity: 0.5,
    size: 46,
    singleTapAction: 'openMenu',
    doubleTapAction: 'multitask',
    longPressAction: 'hideTemporarily',
    menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'spotlight', 'settings'] as MenuItemId[],
    autoHideFullscreen: true,
    contextAwareMenu: true,
    reachabilityOnDoubleTap: false,
    hapticFeedback: true,
    update: mockUpdate,
    ...overrides,
  };
}

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('AssistiveTouchSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAssistive.mockReturnValue(assistive());
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<AssistiveTouchSettingsScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the master switch and customization section when enabled', () => {
    const { getByText, getAllByRole } = render(
      <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />,
    );
    // master + 4 enhancement switches
    expect(getAllByRole('switch').length).toBe(5);
    // CupertinoListSection renders headers uppercased.
    expect(getByText(/Customise Top Level Menu/i)).toBeTruthy();
    expect(getByText('Reset to Defaults')).toBeTruthy();
  });

  // Master switch is the first in the tree.
  it('toggling the master switch updates the store', () => {
    const { getAllByRole } = render(
      <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />,
    );
    fireEvent.press(getAllByRole('switch')[0]);
    expect(mockUpdate).toHaveBeenCalledWith({ enabled: false });
  });

  // Switch order when enabled: [0] master, [1] Auto-hide full-screen,
  // [2] Context-Aware Menu, [3] Reachability on Double-Tap, [4] Haptic Feedback
  it('toggling Auto-hide in Full-Screen updates the store', () => {
    const { getAllByRole } = render(
      <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />,
    );
    fireEvent.press(getAllByRole('switch')[1]);
    expect(mockUpdate).toHaveBeenCalledWith({ autoHideFullscreen: false });
  });

  it('hides the customization section when AssistiveTouch is disabled', () => {
    mockUseAssistive.mockReturnValue(assistive({ enabled: false }));
    const { queryByText } = render(
      <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />,
    );
    expect(queryByText('Customise Top Level Menu')).toBeNull();
    expect(queryByText('Reset to Defaults')).toBeNull();
  });
});
