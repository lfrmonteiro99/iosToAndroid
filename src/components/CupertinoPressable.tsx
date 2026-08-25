import React, { useMemo } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCupertinoPress } from '../hooks/useCupertinoPress';

// CupertinoPressable — the single call site of the useCupertinoPress primitive
// (issue #496, epic #468).
//
// WHY A COMPONENT AND NOT THE BARE HOOK AT EVERY SITE: the ~15 migrated sites
// used `style={({ pressed }) => [..., { opacity: pressed ? N : 1 }]}` with six
// different values for N. The hook returns an animated style, so each site
// would otherwise need its own Animated.Pressable + hook wiring. Wrapping the
// hook once keeps the migration mechanical and keeps the layout style exactly
// where it was: the animated style is composed ONTO the pressable itself, not
// onto an inserted child view, so no site changes its layout tree.
//
// The dim/scale numbers live in useCupertinoPress (0.96 / 0.40 per §3.2).
// Per-site overrides go through `pressOptions` and must carry a comment at the
// call site justifying the deviation.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface CupertinoPressableProps extends Omit<PressableProps, 'style'> {
  /** Static (non-press) style for the pressable itself. */
  style?: StyleProp<ViewStyle>;
  /** Overrides forwarded to useCupertinoPress (opacity / scale / opacityOnly). */
  pressOptions?: Parameters<typeof useCupertinoPress>[1];
  children?: React.ReactNode;
}

export const CupertinoPressable = React.memo(function CupertinoPressable({
  style,
  pressOptions,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: CupertinoPressableProps) {
  const options = useMemo(() => pressOptions ?? {}, [pressOptions]);
  const {
    style: pressStyle,
    onPressIn: pressIn,
    onPressOut: pressOut,
  } = useCupertinoPress(!disabled, options);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressOut();
        onPressOut?.(e);
      }}
      style={[style, pressStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
