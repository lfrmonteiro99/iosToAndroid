import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SettingsProvider } from '../../store/SettingsStore';
import { useCupertinoPress } from '../useCupertinoPress';
import * as Reanimated from 'react-native-reanimated';
import * as GestureUtils from '../../utils/useGestureReduceMotion';

// CONTEXT
// -------
// The shared jest.setup.js mock for react-native-reanimated collapses
// `interpolate` to an identity and stubs useAnimatedStyle to run its factory
// once at render. For this hook the whole point is *what the animated style
// computes* for a given press value, so we install a faithful linear
// `interpolate` and a persistent useSharedValue (the stock mock returns a fresh
// object every render and so loses any `.value` we set between renders).
//
// We also spy on `settle()` to assert reduceMotion is threaded through. Spying
// on withSpring/withTiming directly does NOT work here: settle() carries the
// 'worklet' directive, and the reanimated babel plugin snapshots those
// references at definition time (verified empirically, see the note in the
// repo's own useGestureReduceMotion.test.ts). Asserting the flag the hook
// forwards to settle() is the real, observable seam.
//
// The hook reads `reduceMotion` from settings when the caller doesn't pass it,
// so we wrap in SettingsProvider (gateFirstRender off).

// Faithful linear interpolate: inputs/outputs never leave the clamp bounds
// (matches Reanimated's default Extrapolation.CLAMP over the [0,1] ranges used).
function interpolate(
  value: number,
  inputRange: number[],
  outputRange: number[],
): number {
  const [i0, i1] = inputRange;
  const [o0, o1] = outputRange;
  if (value <= i0) return o0;
  if (value >= i1) return o1;
  return o0 + ((value - i0) / (i1 - i0)) * (o1 - o0);
}

// Persistent shared-value registry keyed by call order within a render pass.
// Reset before every render/rerender so the same hook call order maps to the
// same persistent object (mirroring how RN keeps shared values stable).
let callIndex = 0;
const svRegistry: Array<{ value: number; addListener: () => void; removeListener: () => void; modify: () => void }> = [];

function resetRender() {
  callIndex = 0;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider gateFirstRender={false}>{children}</SettingsProvider>
);

// §3.2 of ESPECIFICACAO.md default press feedback.
const DEFAULT_SCALE = 0.96;
const DEFAULT_OPACITY = 0.4;

type PressStyle = {
  transform?: Array<{ scale: number }>;
  opacity: number;
};

function readStyle(style: unknown): PressStyle {
  return style as PressStyle;
}

let interpSpy: jest.SpyInstance;
let svSpy: jest.SpyInstance;

beforeEach(() => {
  svRegistry.length = 0;
  callIndex = 0;
  interpSpy = jest
    .spyOn(Reanimated, 'interpolate')
    .mockImplementation(interpolate as never);
  svSpy = jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(((init: number) => {
      if (svRegistry[callIndex] === undefined) {
        svRegistry[callIndex] = {
          value: init,
          addListener: () => {},
          removeListener: () => {},
          modify: () => {},
        };
      }
      const sv = svRegistry[callIndex];
      callIndex += 1;
      return sv;
    }) as never);
});

afterEach(() => {
  interpSpy.mockRestore();
  svSpy.mockRestore();
});

describe('useCupertinoPress — defaults, motion ON', () => {
  it('rests at scale 1 / opacity 1', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressOut();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(1, 5);
    expect(style.opacity).toBeCloseTo(1, 5);
  });

  it('fully pressed → scale 0.96 + opacity 0.40', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(DEFAULT_SCALE, 5);
    expect(style.opacity).toBeCloseTo(DEFAULT_OPACITY, 5);
  });
});

describe('useCupertinoPress — opacity override', () => {
  it('honours a custom opacity (0.7) for dense surfaces when fully pressed', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { opacity: 0.7, reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(DEFAULT_SCALE, 5);
    expect(style.opacity).toBeCloseTo(0.7, 5);
  });
});

describe('useCupertinoPress — opacityOnly variant (list rows)', () => {
  it('omits the transform entirely but dims to 0.40 when fully pressed', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { opacityOnly: true, reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform).toBeUndefined();
    expect(style.opacity).toBeCloseTo(DEFAULT_OPACITY, 5);
  });
});

describe('useCupertinoPress — reduceMotion respect', () => {
  it('forwards reduceMotion=true to settle() in both press directions', () => {
    const settleSpy = jest
      .spyOn(GestureUtils, 'settle')
      .mockImplementation(((v: number) => v) as never);

    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { reduceMotion: true }),
      { wrapper },
    );

    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });
    expect(settleSpy).toHaveBeenCalledWith(1, 'mediumSettle', true);

    settleSpy.mockClear();

    act(() => {
      result.current.onPressOut();
      resetRender();
      rerender({});
    });
    expect(settleSpy).toHaveBeenCalledWith(0, 'mediumSettle', true);

    settleSpy.mockRestore();
  });

  it('forwards reduceMotion=false (spring path) to settle()', () => {
    const settleSpy = jest
      .spyOn(GestureUtils, 'settle')
      .mockImplementation(((v: number) => v) as never);

    const { result } = renderHook(
      () => useCupertinoPress(true, { reduceMotion: false }),
      { wrapper },
    );

    act(() => {
      result.current.onPressIn();
    });
    expect(settleSpy).toHaveBeenCalledWith(1, 'mediumSettle', false);

    settleSpy.mockRestore();
  });

  it('falls back to the device reduceMotion setting when not provided', () => {
    const settleSpy = jest
      .spyOn(GestureUtils, 'settle')
      .mockImplementation(((v: number) => v) as never);

    const { result } = renderHook(() => useCupertinoPress(true), { wrapper });

    act(() => {
      result.current.onPressIn();
    });
    // SettingsProvider default reduceMotion is false.
    expect(settleSpy).toHaveBeenCalledWith(1, 'mediumSettle', false);

    settleSpy.mockRestore();
  });
});

describe('useCupertinoPress — disabled (enabled=false)', () => {
  it('never drives the press value: style stays at rest after press/release', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(false, { reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      result.current.onPressOut();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(1, 5);
    expect(style.opacity).toBeCloseTo(1, 5);
  });

  it('still returns callable onPressIn/onPressOut functions', () => {
    const { result } = renderHook(
      () => useCupertinoPress(false, { reduceMotion: false }),
      { wrapper },
    );
    expect(typeof result.current.onPressIn).toBe('function');
    expect(typeof result.current.onPressOut).toBe('function');
  });
});

describe('useCupertinoPress — pressFeedback modes (#497)', () => {
  it('scale-opacity: scale 0.96 + opacity 0.40 when fully pressed (unchanged default)', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { pressFeedback: 'scale-opacity', reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(DEFAULT_SCALE, 5);
    expect(style.opacity).toBeCloseTo(DEFAULT_OPACITY, 5);
  });

  it('opacity: dims to 0.40 but omits the scale transform when fully pressed', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { pressFeedback: 'opacity', reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform).toBeUndefined();
    expect(style.opacity).toBeCloseTo(DEFAULT_OPACITY, 5);
  });

  it('none: stays at rest (scale 1 / opacity 1) even when fully pressed', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { pressFeedback: 'none', reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(1, 5);
    expect(style.opacity).toBeCloseTo(1, 5);
  });

  it('none: an opacityOnly surface (list row) also stays at opacity 1, still omits transform', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { pressFeedback: 'none', opacityOnly: true, reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform).toBeUndefined();
    expect(style.opacity).toBeCloseTo(1, 5);
  });

});

describe('useCupertinoPress — double press / release ordering', () => {
  it('survives press, press again, then release without throwing', () => {
    const { result, rerender } = renderHook(
      () => useCupertinoPress(true, { reduceMotion: false }),
      { wrapper },
    );
    act(() => {
      result.current.onPressIn();
      result.current.onPressIn();
      result.current.onPressOut();
      resetRender();
      rerender({});
    });

    const style = readStyle(result.current.style);
    expect(style.transform?.[0].scale).toBeCloseTo(1, 5);
    expect(style.opacity).toBeCloseTo(1, 5);
  });
});
