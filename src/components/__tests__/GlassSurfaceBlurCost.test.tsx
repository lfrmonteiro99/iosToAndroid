import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { GlassSurface } from '../GlassSurface';
import { useSettings } from '../../store/SettingsStore';

function SetReduceTransparency({ value }: { value: boolean }) {
  const { update } = useSettings();
  React.useEffect(() => {
    update('reduceTransparency', value);
  }, [update, value]);
  return null;
}

// These tests belong to issue #507 (cost measurement of real blur on Android).
// They do NOT measure frame time — that is physically impossible in a headless
// agent with no adb/device (documented in docs/BLUR_COST_MEASUREMENT.md). They
// pin the factual premises the measurement report relies on, so a future refactor
// that scatters blur call sites or drops the experimentalBlurMethod cannot pass
// silently and would invalidate the "single choke point" finding.

describe('GlassSurface — blur cost measurement premises (#507)', () => {
  it('always requests the dimezisBlurView method on the real BlurView (the 26/26 surface)', () => {
    const { UNSAFE_queryAllByType } = render(
      <GlassSurface tint="dark">
        <Text>content</Text>
      </GlassSurface>,
    );

    const blurs = UNSAFE_queryAllByType('BlurView' as never);
    expect(blurs).toHaveLength(1);
    // The measurement report states every production BlurView uses dimezisBlurView.
    // If this prop disappears, the report's premise is broken.
    expect(blurs[0].props).toMatchObject({ experimentalBlurMethod: 'dimezisBlurView' });
  });

  it('stays a single BlurView for a single GlassSurface (no hidden extra surfaces)', () => {
    const { UNSAFE_queryAllByType } = render(
      <GlassSurface tint="light" intensity={40}>
        <Text>content</Text>
      </GlassSurface>,
    );
    // A cost model that assumes 1 GlassSurface == 1 GPU blur surface must hold.
    expect(UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(1);
  });

  it('default A/B branch is the real blur (measurement baseline = "with blur" on)', () => {
    const { UNSAFE_queryAllByType } = render(
      <GlassSurface tint="dark">
        <Text>content</Text>
      </GlassSurface>,
    );
    // The report's A/B procedure toggles reduceTransparency to get the "no blur"
    // leg. The default (reduceTransparency=false) MUST be the blurred leg; if the
    // default flips to the solid fallback, every "with blur" measurement would
    // actually be "without blur" and the numbers would be meaningless.
    expect(UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(1);
  });

  it('reduceTransparency off -> on is a true A/B toggle for the same surface count', () => {
    const off = render(
      <GlassSurface tint="dark">
        <Text>content</Text>
      </GlassSurface>,
    );
    expect(off.UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(1);

    const { unmount } = off;
    unmount();

    const on = render(
      <>
        <SetReduceTransparency value={true} />
        <GlassSurface tint="dark">
          <Text>content</Text>
        </GlassSurface>
      </>,
    );
    // The "no blur" leg must remove the GPU surface entirely (solid View instead),
    // giving a clean A/B delta with no residual BlurView.
    expect(on.UNSAFE_queryAllByType('BlurView' as never)).toHaveLength(0);
    expect(on.getByText('content')).toBeTruthy();
  });
});
