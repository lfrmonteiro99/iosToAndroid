import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { SiriSearchScreen } from '../SiriSearchScreen';

const mockUpdate = jest.fn();
const baseSettings = {
  searchShowSuggestions: true,
  searchShowInSearch: true,
  searchShowInLibrary: true,
};

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: baseSettings, update: mockUpdate })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSettings } = require('../../../store/SettingsStore');

function setSettings(partial: Record<string, unknown>) {
  (useSettings as jest.Mock).mockReturnValue({
    settings: { ...baseSettings, ...partial },
    update: mockUpdate,
  });
}

describe('SiriSearchScreen (#610)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSettings({});
  });

  it('renders the three Siri & Search toggles', () => {
    const { getByText } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    expect(getByText('Siri & Search')).toBeTruthy();
    expect(getByText('Show Suggestions')).toBeTruthy();
    expect(getByText('Show Apps in Search')).toBeTruthy();
    expect(getByText('Show Apps in App Library')).toBeTruthy();
  });

  it('navigates back when the Settings back button is pressed', () => {
    const { getByText } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Settings'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  // Ordem dos switches: [0] Show Suggestions, [1] Show Apps in Search,
  // [2] Show Apps in App Library.
  it('all three switches default to on', () => {
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    const switches = getAllByRole('switch');
    expect(switches).toHaveLength(3);
    expect(switches.map((s) => s.props.accessibilityLabel)).toEqual(['On', 'On', 'On']);
  });

  it('toggling Show Suggestions off persists searchShowSuggestions=false', () => {
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    fireEvent.press(getAllByRole('switch')[0]);
    expect(mockUpdate).toHaveBeenCalledWith('searchShowSuggestions', false);
  });

  it('toggling Show Apps in Search off persists searchShowInSearch=false', () => {
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    fireEvent.press(getAllByRole('switch')[1]);
    expect(mockUpdate).toHaveBeenCalledWith('searchShowInSearch', false);
  });

  it('toggling Show Apps in App Library off persists searchShowInLibrary=false', () => {
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    fireEvent.press(getAllByRole('switch')[2]);
    expect(mockUpdate).toHaveBeenCalledWith('searchShowInLibrary', false);
  });

  // O inverso do fix: com os toggles já desligados, tocar volta a ligá-los.
  it('toggling an already-off switch turns it back on', () => {
    setSettings({ searchShowInLibrary: false });
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    const switches = getAllByRole('switch');
    expect(switches[2].props.accessibilityLabel).toBe('Off');
    fireEvent.press(switches[2]);
    expect(mockUpdate).toHaveBeenCalledWith('searchShowInLibrary', true);
  });

  // Duplo toque (defeito recorrente do repositório): dois presses seguidos
  // sobre o mesmo switch produzem duas chamadas com o mesmo valor, porque o
  // valor vem das settings e não de estado local — não alternam entre si.
  it('double-tapping a switch does not flip it back (value comes from settings)', () => {
    const { getAllByRole } = render(<SiriSearchScreen navigation={mockNavigation as never} />);
    const target = getAllByRole('switch')[1];
    fireEvent.press(target);
    fireEvent.press(target);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, 'searchShowInSearch', false);
    expect(mockUpdate).toHaveBeenNthCalledWith(2, 'searchShowInSearch', false);
  });
});
