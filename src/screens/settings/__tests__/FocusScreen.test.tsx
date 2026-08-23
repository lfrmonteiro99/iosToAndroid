import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { FocusScreen } from '../FocusScreen';
import { notificationCallbackForFocus } from '../../../utils/notificationFocusFilter';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('FocusScreen', () => {
  it('renders all focus mode options', () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(getByText('Do Not Disturb')).toBeTruthy();
    expect(getByText('Sleep')).toBeTruthy();
    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Personal')).toBeTruthy();
  });

  it('renders the screen without crashing', () => {
    const { toJSON } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('hides From/To pickers when schedule is off', () => {
    const { queryByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(queryByText('From')).toBeNull();
    expect(queryByText('To')).toBeNull();
  });

  it('shows From/To pickers when schedule is toggled on, with default times', () => {
    const { getByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    // Liga o switch "Focus Schedule"
    const switches = getAllByRole('switch');
    const scheduleSwitch = switches[switches.length - 1];
    fireEvent.press(scheduleSwitch);

    expect(getByText('From')).toBeTruthy();
    expect(getByText('To')).toBeTruthy();
    // Valores por omissão 09:00 / 17:00
    expect(getByText('09:00')).toBeTruthy();
    expect(getByText('17:00')).toBeTruthy();
  });

  it('opens the From time picker and changes the start time', () => {
    const { getByText, getAllByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]); // liga schedule

    fireEvent.press(getByText('From')); // abre o action sheet "From"

    // O action sheet está visível: o título "From" aparece (tile + título do sheet).
    expect(getAllByText('From').length).toBeGreaterThanOrEqual(1);
    // Escolhe uma hora diferente (12:30 existe no passo de 30 min).
    fireEvent.press(getByText('12:30'));

    // O novo valor reflete no tile.
    expect(getByText('12:30')).toBeTruthy();
  });

  it('opens the To time picker and changes the end time', () => {
    const { getByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]);

    fireEvent.press(getByText('To'));
    fireEvent.press(getByText('20:00'));

    expect(getByText('20:00')).toBeTruthy();
  });

  it('does not mutate the To value when the From picker is used (independent fields)', () => {
    const { getByText, getAllByRole, queryByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]);

    fireEvent.press(getByText('From'));
    fireEvent.press(getByText('06:00'));

    // To mantém o default 17:00; o 06:00 só aparece uma vez (no From).
    expect(getByText('17:00')).toBeTruthy();
    // 06:00 deve aparecer exatamente 1x (no tile From); se tivesse vazado para To, apareceria 2x.
    const fromMatches = queryByText('06:00');
    expect(fromMatches).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Notification suppression unit tests (red step proven against pre-fix App.tsx)
// ---------------------------------------------------------------------------
describe('notificationCallbackForFocus — focus mode suppression', () => {
  const makeRefs = (focusMode: string) => ({
    seenIds: { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    focusModeRef: { current: focusMode } as React.MutableRefObject<string>,
  });

  const testNotif = { id: 'n1', title: 'Hello', text: 'World', packageName: 'com.test.app' };

  it('does NOT call setBanner when focus mode is active (doNotDisturb)', () => {
    const { seenIds, focusModeRef } = makeRefs('doNotDisturb');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('does NOT call setBanner when focus mode is active (sleep)', () => {
    const { seenIds, focusModeRef } = makeRefs('sleep');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('DOES call setBanner when focus mode is off', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hello',
      body: 'World',
      appName: 'app',
    }));
  });

  it('does not re-show an already-seen notification id', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    seenIds.current.add('n1');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('silently ignores null/undefined notification', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(null, seenIds, focusModeRef, setBanner);
    notificationCallbackForFocus(undefined, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });
});
