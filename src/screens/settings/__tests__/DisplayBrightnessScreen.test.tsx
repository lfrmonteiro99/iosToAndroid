import React from 'react';
import { render } from '../../../test-utils';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('DisplayBrightnessScreen', () => {
  it('offers Light / Dark / Automatic appearance options', () => {
    const { getAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    // 'Light'/'Dark' appear both as the phone-mock labels and as the segmented
    // control options; 'Automatic' only exists in the segmented control.
    expect(getAllByText('Light').length).toBeGreaterThan(0);
    expect(getAllByText('Dark').length).toBeGreaterThan(0);
    expect(getAllByText('Automatic').length).toBeGreaterThan(0);
  });
});
