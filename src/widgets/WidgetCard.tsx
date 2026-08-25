import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { GlassSurface } from '../components/GlassSurface';
import { Shape } from '../theme/CupertinoTheme';

export interface WidgetCardProps {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Shared glass-backed widget card frame used by Today View widgets (#652,
 * #653) and by SmartStack (#655) — extracted out of TodayViewScreen so both
 * can reuse the same visual chrome instead of forking it. `flex: 1` lets it
 * fill a taller grid cell (e.g. Today View's 'large' size) instead of
 * leaving a blank gap under the content; spacing between cells is the
 * caller's responsibility (e.g. Today View's grid cell margins).
 */
export function WidgetCard({ children, style, onPress, accessibilityLabel, testID }: WidgetCardProps) {
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        style={({ pressed }) => [styles.widgetCard, style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        <GlassSurface intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.widgetContent}>{children}</View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.widgetCard, style]}>
      <GlassSurface intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.widgetContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  widgetCard: {
    flex: 1,
    borderRadius: Shape.widgetSmall.radius,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,35,0.6)',
  },
  widgetContent: {
    padding: 16,
  },
});
