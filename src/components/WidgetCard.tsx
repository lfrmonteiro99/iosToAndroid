import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { GlassSurface } from './GlassSurface';

export interface WidgetCardProps {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * Shared glass-backed widget card frame used by Today View widgets (#652) and
 * by SmartStack (#655) — extracted out of TodayViewScreen so both can reuse
 * the same visual chrome instead of forking it.
 */
export function WidgetCard({ children, style, onPress, accessibilityLabel }: WidgetCardProps) {
  if (onPress) {
    return (
      <Pressable
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
    <View style={[styles.widgetCard, style]}>
      <GlassSurface intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.widgetContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  widgetCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: 'rgba(30,30,35,0.6)',
  },
  widgetContent: {
    padding: 16,
  },
});
