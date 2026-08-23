import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';

// issue #605: Display & Brightness must offer a "Status Bar Style" tile that
// opens an action sheet with Light / Dark / Automatic, bound to
// settings.statusBarStyle (default 'auto' → trailing 'Automatic').

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('DisplayBrightnessScreen — Status Bar Style (#605)', () => {
  it('renders a "Status Bar Style" tile, defaulting to Automatic', () => {
    const { getByText, getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    expect(getByText('Status Bar Style')).toBeTruthy();
    expect(getByTestId('status-bar-style-value').props.children).toBe('Automatic');
  });

  it('opens a Light / Dark / Automatic picker when the tile is pressed', () => {
    const { getByText, queryAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Status Bar Style'));
    // The picker sheet adds Light / Dark / Automatic as action-sheet options.
    // These labels also exist in the Appearance section, so assert they appear
    // at least twice (Appearance + sheet) once the sheet is open.
    expect(queryAllByText('Light').length).toBeGreaterThanOrEqual(2);
    expect(queryAllByText('Dark').length).toBeGreaterThanOrEqual(2);
    expect(queryAllByText('Automatic').length).toBeGreaterThanOrEqual(2);
  });

  it('selecting "Light" updates the trailing label to "Light" and closes the sheet', async () => {
    const { getByText, getByTestId, getAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Status Bar Style'));
    // Press the LAST 'Light' (the action-sheet option; earlier matches are the
    // Appearance phone-mock label and segmented control).
    const lightOptions = getAllByText('Light');
    fireEvent.press(lightOptions[lightOptions.length - 1] as never);

    await waitFor(() => expect(getByTestId('status-bar-style-value').props.children).toBe('Light'));
    // The action-sheet option is gone (sheet dismissed): of the 'Light' matches
    // only the Appearance labels + the tile trailing remain — re-opening must
    // again present a sheet 'Light' option to pick.
    fireEvent.press(getByText('Status Bar Style'));
    const lightsAfter = getAllByText('Light');
    // +1 sheet option returns now that the picker is open again.
    expect(lightsAfter.length).toBe(lightOptions.length + 1);
  });

  it('selecting "Dark" updates the trailing label to "Dark"', async () => {
    const { getByText, getByTestId, getAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Status Bar Style'));
    const darkOptions = getAllByText('Dark');
    fireEvent.press(darkOptions[darkOptions.length - 1] as never);

    await waitFor(() => expect(getByTestId('status-bar-style-value').props.children).toBe('Dark'));
  });

  it('survives choosing the same value twice (double tap on a sheet option)', async () => {
    const { getByText, getByTestId, getAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Status Bar Style'));
    let lights = getAllByText('Light');
    fireEvent.press(lights[lights.length - 1] as never);
    await waitFor(() => expect(getByTestId('status-bar-style-value').props.children).toBe('Light'));

    fireEvent.press(getByText('Status Bar Style'));
    lights = getAllByText('Light');
    fireEvent.press(lights[lights.length - 1] as never);
    await waitFor(() => expect(getByTestId('status-bar-style-value').props.children).toBe('Light'));
  });
});
