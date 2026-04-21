import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface SpotlightRevealProps {
  // Externally-controlled progress (0..1+). Animation comes from the parent's
  // pan gesture — the component is purely visual so it doesn't sit on top of
  // home content capturing taps.
  progress: SharedValue<number>;
}

export function SpotlightReveal({ progress }: SpotlightRevealProps) {
  // Animated affordance: search field that slides in from above
  const fieldStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(1, progress.value);
    // Remove from layout (and therefore from hit-testing) when fully retracted.
    const display = progress.value <= 0.001 ? 'none' : 'flex';
    return {
      opacity: p,
      transform: [{ translateY: (p - 1) * 30 }],
      display,
    };
  });

  const dimStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(1, progress.value);
    const display = progress.value <= 0.001 ? 'none' : 'flex';
    return {
      opacity: p * 0.4,
      display,
    };
  });

  return (
    <>
      {/* Full-screen dim overlay — purely visual */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
      />
      {/* Search field affordance — preview only, real field is on SpotlightSearchScreen */}
      <Animated.View
        pointerEvents="none"
        style={[styles.fieldHolder, fieldStyle]}
        accessibilityLabel="Spotlight Search"
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Search</Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000',
    zIndex: 19,
  },
  fieldHolder: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: 80,
    zIndex: 21,
    alignItems: 'center',
  },
  field: {
    width: '100%',
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '400',
  },
});
