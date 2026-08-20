import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { ComponentsGalleryScreen } from '../ComponentsGalleryScreen';

describe('ComponentsGalleryScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(<ComponentsGalleryScreen />);
    // The navigation bar title is rendered by the screen.
    expect(getByText('Components')).toBeTruthy();
  });

  it('renders the expected section headers', () => {
    const { getByText } = render(<ComponentsGalleryScreen />);
    // Each SectionHeader renders its title text verbatim (textTransform is a
    // style only; the text node content is unchanged).
    ['Buttons', 'Switch', 'Slider', 'Progress Bar', 'Activity Indicator', 'Picker', 'Text Field', 'Segmented Control', 'Cards', 'Swipeable Row', 'List Section', 'Modals'].forEach(
      (title) => {
        expect(getByText(title)).toBeTruthy();
      },
    );
  });

  it('updates the displayed download percentage when a progress preset is pressed', () => {
    const { getByText } = render(<ComponentsGalleryScreen />);

    // Initial state: progressValue = 0.65 → "Download: 65%"
    expect(getByText('Download: 65%')).toBeTruthy();

    // Pressing the "100%" preset button sets progressValue to 1.
    fireEvent.press(getByText('100%'));

    expect(getByText('Download: 100%')).toBeTruthy();

    // Pressing "Reset" returns it to 0.
    fireEvent.press(getByText('Reset'));

    expect(getByText('Download: 0%')).toBeTruthy();
  });
});
