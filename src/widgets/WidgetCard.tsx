import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassSurface } from '../components/GlassSurface';
import { Shape } from '../theme/CupertinoTheme';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';

export type WidgetSurfaceKind = 'solid' | 'gradient';

export interface WidgetAppearance {
  surface: WidgetSurfaceKind;
  /** Background for a 'solid' surface, and the fallback every surface kind uses when Reduce Transparency is on. */
  solidColor: { light: string; dark: string };
  /** Two-stop background for a 'gradient' surface; ignored for 'solid'. */
  gradientColors?: readonly [string, string];
}

export interface WidgetCardProps {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /**
   * Omitted = today's frame, unchanged: glass blur, dark tint. Pass an
   * appearance to opt a widget into a themed solid or gradient surface
   * instead (#934) — the four widgets not migrated by this issue keep the
   * omitted default so they don't regress.
   */
  appearance?: WidgetAppearance;
}

function WidgetBackground({ appearance, isDark, reduceTransparency }: { appearance?: WidgetAppearance; isDark: boolean; reduceTransparency: boolean }) {
  if (!appearance) {
    return <GlassSurface intensity={55} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  const solidColor = appearance.solidColor[isDark ? 'dark' : 'light'];
  if (!reduceTransparency && appearance.surface === 'gradient' && appearance.gradientColors) {
    return <LinearGradient colors={appearance.gradientColors} style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: solidColor }]} />;
}

/**
 * Shared widget card frame used by Today View widgets (#652, #653) and by
 * SmartStack (#655) — extracted out of TodayViewScreen so both can reuse the
 * same visual chrome instead of forking it. `flex: 1` lets it fill a taller
 * grid cell (e.g. Today View's 'large' size) instead of leaving a blank gap
 * under the content; spacing between cells is the caller's responsibility
 * (e.g. Today View's grid cell margins).
 */
export function WidgetCard({ children, style, onPress, accessibilityLabel, testID, appearance }: WidgetCardProps) {
  const { isDark } = useTheme();
  const { settings } = useSettings();

  // The default (omitted) appearance's own GlassSurface fully covers this frame,
  // but the fallback fill guards the brief window before the native blur mounts —
  // preserved exactly as-is so unmigrated widgets don't regress. Migrated
  // widgets paint their own opaque surface, so it's dropped there instead of
  // sitting unused underneath.
  const cardStyle = appearance ? styles.widgetCardNoFallback : styles.widgetCard;

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        style={({ pressed }) => [cardStyle, style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        <WidgetBackground appearance={appearance} isDark={isDark} reduceTransparency={settings.reduceTransparency} />
        <View style={styles.widgetContent}>{children}</View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[cardStyle, style]}>
      <WidgetBackground appearance={appearance} isDark={isDark} reduceTransparency={settings.reduceTransparency} />
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
  widgetCardNoFallback: {
    flex: 1,
    borderRadius: Shape.widgetSmall.radius,
    overflow: 'hidden',
  },
  widgetContent: {
    padding: 16,
  },
});
