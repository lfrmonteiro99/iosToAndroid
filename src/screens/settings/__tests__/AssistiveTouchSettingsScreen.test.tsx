import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { AssistiveTouchSettingsScreen } from '../AssistiveTouchSettingsScreen';
import { AlertProvider } from '../../../components/AlertProvider';
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

  // Real interaction: the header back button ("Accessibility") calls
  // navigation.goBack(). This is the unique occurrence of that text in the tree.
  it('navigates back when the Accessibility back button is pressed', () => {
    const { getByText } = render(<AssistiveTouchSettingsScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Accessibility'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
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

// ── Top-level menu editing ──────────────────────────────────────────────────
// These render inside a real AlertProvider: the picker and the cap warning are
// alerts, so a stubbed no-op alert would hide the very behaviour under test.
describe('AssistiveTouchSettingsScreen top-level menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAssistive.mockReturnValue(assistive());
  });

  function renderScreen() {
    return render(
      <AlertProvider>
        <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />
      </AlertProvider>,
    );
  }

  it('the minus removes the item from the menu', () => {
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('Remove Spotlight'));
    expect(mockUpdate).toHaveBeenCalledWith({
      menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'settings'],
    });
  });

  it('Add Item warns instead of opening an unusable picker when the menu is full', () => {
    const { getByText, queryByText } = renderScreen();
    fireEvent.press(getByText('Add Item'));
    expect(getByText('Limit Reached')).toBeTruthy();
    expect(queryByText('Add to Menu')).toBeNull();
  });

  it('Add Item offers Siri and appends it once there is a free slot', () => {
    mockUseAssistive.mockReturnValue(
      assistive({ menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'spotlight'] }),
    );
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Add Item'));
    expect(getByText('Add to Menu')).toBeTruthy();
    fireEvent.press(getByText('Siri'));
    expect(mockUpdate).toHaveBeenCalledWith({
      menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'spotlight', 'siri'],
    });
  });

  it('the action picker offers Siri for a single tap', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Single-Tap'));
    fireEvent.press(getByText('Siri'));
    expect(mockUpdate).toHaveBeenCalledWith({ singleTapAction: 'siri' });
  });
});

// ── Expanded catalog ────────────────────────────────────────────────────────
describe('AssistiveTouchSettingsScreen expanded action catalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAssistive.mockReturnValue(assistive());
  });

  function renderScreen() {
    return render(
      <AlertProvider>
        <AssistiveTouchSettingsScreen navigation={mockNavigation as never} />
      </AlertProvider>,
    );
  }

  it.each([
    ['Camera',      'camera'],
    ['Torch',       'flashlight'],
    ['Volume Up',   'volumeUp'],
    ['Volume Down', 'volumeDown'],
    ['Mute',        'mute'],
    ['Accessibility', 'accessibility'],
    ['Device',      'device'],
    ['Custom',      'custom'],
  ])('the action picker offers %s and maps it to Single-Tap', (label, id) => {
    const { getByText, getAllByText } = renderScreen();
    fireEvent.press(getByText('Single-Tap'));
    // The label may also appear elsewhere (nav back button, list header): the
    // picker option is the LAST match, added when the alert modal renders.
    const matches = getAllByText(label);
    fireEvent.press(matches[matches.length - 1]);
    expect(mockUpdate).toHaveBeenCalledWith({ singleTapAction: id });
  });

  it('Add Item offers the new menu categories once slots open up', () => {
    mockUseAssistive.mockReturnValue(assistive({ menuItems: ['home'] }));
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Add Item'));
    // Any of the new categories must be reachable from the picker.
    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Device')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
  });
});
