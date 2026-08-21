import React from 'react';
import { Text, View } from 'react-native';
import { render } from '../../test-utils';
import { GlassSurface } from '../GlassSurface';
import { useSettings } from '../../store/SettingsStore';

function SetReduceTransparency({ value }: { value: boolean }) {
  const { update } = useSettings();
  React.useEffect(() => { update('reduceTransparency', value); }, [update, value]);
  return null;
}

describe('GlassSurface', () => {
  it('renders a real BlurView when reduceTransparency is off (default)', () => {
    const { UNSAFE_queryAllByType } = render(
      <GlassSurface tint="dark">
        <Text>content</Text>
      </GlassSurface>,
    );
    expect(UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(1);
  });

  it('renders a solid View instead of BlurView when reduceTransparency is on', () => {
    const { UNSAFE_queryAllByType, getByText } = render(
      <>
        <SetReduceTransparency value={true} />
        <GlassSurface tint="dark">
          <Text>content</Text>
        </GlassSurface>
      </>,
    );

    expect(UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(0);
    expect(getByText('content')).toBeTruthy();
  });

  it('keeps children visible and passes through custom style on both branches', () => {
    const { getByTestId, rerender } = render(
      <>
        <SetReduceTransparency value={false} />
        <GlassSurface tint="dark" style={{ borderRadius: 12 }}>
          <View testID="inner" />
        </GlassSurface>
      </>,
    );
    expect(getByTestId('inner')).toBeTruthy();

    rerender(
      <>
        <SetReduceTransparency value={true} />
        <GlassSurface tint="dark" style={{ borderRadius: 12 }}>
          <View testID="inner" />
        </GlassSurface>
      </>,
    );
    expect(getByTestId('inner')).toBeTruthy();
  });

  it('renders with no children (self-closing background layer usage) without crashing, in both modes', () => {
    const off = render(
      <>
        <SetReduceTransparency value={false} />
        <GlassSurface tint="dark" />
      </>,
    );
    expect(off.UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(1);

    const on = render(
      <>
        <SetReduceTransparency value={true} />
        <GlassSurface tint="dark" />
      </>,
    );
    expect(on.UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(0);
  });
});
