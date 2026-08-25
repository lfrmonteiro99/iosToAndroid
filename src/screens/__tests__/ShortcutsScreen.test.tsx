import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import { ShortcutsScreen } from '../ShortcutsScreen';
import { useSettings } from '../../store/SettingsStore';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

/** Reads settings.focusMode by mounting a probe alongside the screen. */
function FocusModeProbe() {
  const { settings } = useSettings();
  return <Text testID="focus-mode-probe">{settings.focusMode}</Text>;
}

describe('ShortcutsScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ShortcutsScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the two built-in templates', () => {
    const { getByText } = render(<ShortcutsScreen navigation={nav} />);
    expect(getByText('Start Work')).toBeTruthy();
    expect(getByText('Going Home')).toBeTruthy();
  });

  it('running the Start Work template sets focusMode to work via useSettings()', async () => {
    const { getByLabelText, getByTestId } = render(
      <>
        <ShortcutsScreen navigation={nav} />
        <FocusModeProbe />
      </>,
    );

    fireEvent.press(getByLabelText('Run Start Work'));

    await waitFor(() => {
      expect(getByTestId('focus-mode-probe').props.children).toBe('work');
    });
  });

  it('running the Going Home template sets focusMode back to off', async () => {
    const { getByLabelText, getByTestId } = render(
      <>
        <ShortcutsScreen navigation={nav} />
        <FocusModeProbe />
      </>,
    );

    fireEvent.press(getByLabelText('Run Start Work'));
    await waitFor(() => {
      expect(getByTestId('focus-mode-probe').props.children).toBe('work');
    });

    fireEvent.press(getByLabelText('Run Going Home'));
    await waitFor(() => {
      expect(getByTestId('focus-mode-probe').props.children).toBe('off');
    });
  });

  it('adding the Start Work template saves it to the shortcuts list', async () => {
    const { getByLabelText, findAllByText } = render(<ShortcutsScreen navigation={nav} />);

    fireEvent.press(getByLabelText('Add Start Work'));

    // "Start Work" now appears twice: once in the templates section, once in
    // the saved "My Shortcuts" list.
    expect(await findAllByText('Start Work')).toHaveLength(2);
  });

  it('shows the empty state when there are no saved shortcuts', () => {
    const { getByText } = render(<ShortcutsScreen navigation={nav} />);
    expect(getByText('No Shortcuts')).toBeTruthy();
  });

  it('deleting a saved shortcut removes it from the list', async () => {
    const utils = render(<ShortcutsScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Add Start Work'));
    await utils.findAllByText('Start Work');

    fireEvent.press(utils.getByText('Delete Start Work'));

    await waitFor(() => {
      expect(utils.queryAllByText('Start Work')).toHaveLength(1);
    });
  });
});
