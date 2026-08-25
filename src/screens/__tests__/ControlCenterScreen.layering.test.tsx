import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { ControlCenterScreen } from '../ControlCenterScreen';
import { useSettings } from '../../store/SettingsStore';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

function SetReduceTransparency({ value }: { value: boolean }) {
  const { update } = useSettings();
  React.useEffect(() => { update('reduceTransparency', value); }, [update, value]);
  return null;
}

/** True when `node` has an ancestor whose element type renders the blur surface. */
function hasBlurAncestor(node: { parent: unknown } | null): boolean {
  let cur = node as { parent: unknown; type?: unknown } | null;
  while (cur) {
    const t = cur.type;
    const name = typeof t === 'string' ? t : (t as { displayName?: string; name?: string })?.displayName ?? (t as { name?: string })?.name;
    if (name === 'BlurView') return true;
    cur = cur.parent as typeof cur;
  }
  return false;
}

describe('ControlCenterScreen — glass layering (#684)', () => {
  it('mounts no childless full-bleed BlurView that can paint over the sheet content', () => {
    const { UNSAFE_getAllByType } = render(
      <ControlCenterScreen navigation={navigation} />,
    );
    const blurs = UNSAFE_getAllByType('BlurView' as never);
    expect(blurs.length).toBeGreaterThan(0);
    const childless = blurs.filter((b) => b.children.length === 0);
    expect(childless).toHaveLength(0);
  });

  it('renders the toggle grid INSIDE the sheet blur surface, not as a sibling below it', () => {
    const { getByLabelText } = render(
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(hasBlurAncestor(getByLabelText(/^Airplane/) as never)).toBe(true);
  });

  it('renders the music card text and the mirroring row inside their own blur surfaces', () => {
    const { getByText, getByLabelText } = render(
      <ControlCenterScreen navigation={navigation} />,
    );
    expect(hasBlurAncestor(getByText('Not Playing') as never)).toBe(true);
    expect(getByLabelText('Screen Mirroring')).toBeTruthy();
    expect(hasBlurAncestor(getByText('Screen Mirroring') as never)).toBe(true);
  });

  it('keeps every control visible with reduceTransparency ON (solid fallback, zero BlurView)', () => {
    const { UNSAFE_queryAllByType, getByLabelText, getByText } = render(
      <>
        <SetReduceTransparency value={true} />
        <ControlCenterScreen navigation={navigation} />
      </>,
    );
    expect(UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(0);
    expect(getByLabelText(/^Airplane/)).toBeTruthy();
    expect(getByLabelText(/^Wi-Fi/)).toBeTruthy();
    expect(getByText('Brightness')).toBeTruthy();
    expect(getByText('Volume')).toBeTruthy();
    expect(getByText('Not Playing')).toBeTruthy();
  });

  it('still renders the sliders and shortcuts after the Wi-Fi toggle is pressed twice', () => {
    const { getByLabelText, getByText } = render(
      <ControlCenterScreen navigation={navigation} />,
    );
    const wifi = getByLabelText(/^Wi-Fi/);
    fireEvent.press(wifi);
    fireEvent.press(wifi);
    expect(getByText('Brightness')).toBeTruthy();
    expect(getByText('Volume')).toBeTruthy();
    expect(getByText('Torch')).toBeTruthy();
    expect(hasBlurAncestor(getByLabelText(/^Wi-Fi/) as never)).toBe(true);
  });
});
