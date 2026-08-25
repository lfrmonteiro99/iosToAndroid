import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';
import { AccentColors } from '../../../theme/CupertinoTheme';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function renderScreen() {
  return render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
}

/** The swatch's resolved backgroundColor, whatever shape the style prop has. */
function swatchColor(node: { props: { style: unknown } }): string | undefined {
  const flat = ([] as unknown[]).concat(node.props.style as unknown[]);
  for (const entry of flat.reverse()) {
    const bg = (entry as { backgroundColor?: string } | null)?.backgroundColor;
    if (bg) return bg;
  }
  return undefined;
}

const ACCENT_LABELS = ['Blue', 'Purple', 'Pink', 'Red', 'Orange', 'Green'];

describe('DisplayBrightnessScreen — Tint picker', () => {
  it('renders a Tint tile showing the current accent (default Blue)', () => {
    const { getByText, getByTestId } = renderScreen();
    expect(getByText('Blue')).toBeTruthy();
    const blue = [AccentColors.blue.light, AccentColors.blue.dark];
    expect(blue).toContain(swatchColor(getByTestId('tint-swatch')));
  });

  it('keeps the picker closed until the tile is pressed (inverse of the fix)', () => {
    const { queryByText, getByText } = renderScreen();
    // 'Purple' only exists inside the action sheet options.
    expect(queryByText('Purple')).toBeNull();
    fireEvent.press(getByText('Tint'));
    expect(queryByText('Purple')).toBeTruthy();
  });

  it('lists every key of AccentColors in the sheet', () => {
    const { getByText, getAllByText } = renderScreen();
    fireEvent.press(getByText('Tint'));
    expect(ACCENT_LABELS).toHaveLength(Object.keys(AccentColors).length);
    for (const label of ACCENT_LABELS) {
      expect(getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('applies the chosen accent to the theme and closes the sheet', () => {
    const { getByText, getByTestId, queryByText } = renderScreen();
    fireEvent.press(getByText('Tint'));
    fireEvent.press(getByText('Purple'));
    const purple = [AccentColors.purple.light, AccentColors.purple.dark];
    expect(purple).toContain(swatchColor(getByTestId('tint-swatch')));
    // sheet dismissed → the option label is gone, only the tile trailing remains
    expect(queryByText('Blue')).toBeNull();
  });

  it('survives choosing the same colour twice (double tap)', () => {
    const { getByText, getAllByText, getByTestId } = renderScreen();
    fireEvent.press(getByText('Tint'));
    fireEvent.press(getByText('Green'));
    fireEvent.press(getByText('Tint'));
    // 'Green' now appears twice: the tile trailing and the sheet option.
    const options = getAllByText('Green');
    fireEvent.press(options[options.length - 1]);
    const green = [AccentColors.green.light, AccentColors.green.dark];
    expect(green).toContain(swatchColor(getByTestId('tint-swatch')));
  });

  it('switches again from a non-default accent (order independence)', () => {
    const { getByText, getByTestId } = renderScreen();
    fireEvent.press(getByText('Tint'));
    fireEvent.press(getByText('Red'));
    fireEvent.press(getByText('Tint'));
    fireEvent.press(getByText('Orange'));
    const orange = [AccentColors.orange.light, AccentColors.orange.dark];
    expect(orange).toContain(swatchColor(getByTestId('tint-swatch')));
  });
});
