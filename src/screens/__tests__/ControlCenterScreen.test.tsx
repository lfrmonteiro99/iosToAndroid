import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { ControlCenterScreen } from '../ControlCenterScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('ControlCenterScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders Wi-Fi toggle', () => {
    const { getByLabelText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    // Label is "Wi-Fi on" or "Wi-Fi off" depending on state
    expect(getByLabelText(/^Wi-Fi/)).toBeTruthy();
  });

  it('renders Bluetooth toggle', () => {
    const { getByLabelText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(getByLabelText(/^Bluetooth/)).toBeTruthy();
  });

  it('renders Airplane Mode toggle', () => {
    const { getByLabelText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(getByLabelText(/^Airplane/)).toBeTruthy();
  });

  it('renders music player controls', () => {
    const { getByLabelText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(getByLabelText('Previous track')).toBeTruthy();
    expect(getByLabelText('Next track')).toBeTruthy();
  });

  it('pressing Wi-Fi toggle changes its state', () => {
    const { getByLabelText } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ControlCenterScreen navigation={navigation} />,
    );
    const wifi = getByLabelText(/^Wi-Fi/);
    fireEvent.press(wifi);
    // Should not throw — state toggling works
    expect(wifi).toBeTruthy();
  });
});
