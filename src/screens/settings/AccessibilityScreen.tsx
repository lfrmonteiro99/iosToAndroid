import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
  CupertinoSlider,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const TEXT_SIZE_LABELS = ['Small', 'Default', 'Large', 'XL'];

const A11Y_KEYS = {
  textscale: '@iostoandroid/a11y_textscale',
  bold: '@iostoandroid/a11y_bold',
  reduceMotion: '@iostoandroid/a11y_reduce_motion',
  contrast: '@iostoandroid/a11y_contrast',
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AccessibilityScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing, textScale } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [smartInvert, setSmartInvert] = useState(false);
  const [colorFilters, setColorFilters] = useState(false);

  // In-app accessibility preferences
  const [largerTextEnabled, setLargerTextEnabled] = useState(false);
  const [largerTextScale, setLargerTextScale] = useState(1.0);
  const [boldTextLocal, setBoldTextLocal] = useState(false);
  const [reduceMotionLocal, setReduceMotionLocal] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    AsyncStorage.getMany(Object.values(A11Y_KEYS)).then((map) => {
      const scale = parseFloat(map[A11Y_KEYS.textscale] ?? '1.0');
      if (!isNaN(scale)) {
        setLargerTextScale(scale);
        setLargerTextEnabled(scale > 1.0);
      }
      if (map[A11Y_KEYS.bold] !== null) setBoldTextLocal(map[A11Y_KEYS.bold] === 'true');
      if (map[A11Y_KEYS.reduceMotion] !== null) setReduceMotionLocal(map[A11Y_KEYS.reduceMotion] === 'true');
      if (map[A11Y_KEYS.contrast] !== null) setHighContrast(map[A11Y_KEYS.contrast] === 'true');
    });
  }, []);

  const toggleLargerText = useCallback((v: boolean) => {
    setLargerTextEnabled(v);
    const newScale = v ? Math.max(largerTextScale, 1.1) : 1.0;
    setLargerTextScale(newScale);
    AsyncStorage.setItem(A11Y_KEYS.textscale, String(newScale));
  }, [largerTextScale]);

  const handleTextScale = useCallback((v: number) => {
    const clamped = Math.round(v * 100) / 100;
    setLargerTextScale(clamped);
    AsyncStorage.setItem(A11Y_KEYS.textscale, String(clamped));
  }, []);

  const toggleBoldText = useCallback((v: boolean) => {
    setBoldTextLocal(v);
    update('boldText', v);
    AsyncStorage.setItem(A11Y_KEYS.bold, String(v));
  }, [update]);

  const toggleReduceMotion = useCallback((v: boolean) => {
    setReduceMotionLocal(v);
    update('reduceMotion', v);
    AsyncStorage.setItem(A11Y_KEYS.reduceMotion, String(v));
  }, [update]);

  const toggleHighContrast = useCallback((v: boolean) => {
    setHighContrast(v);
    AsyncStorage.setItem(A11Y_KEYS.contrast, String(v));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Accessibility"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Vision — in-app controls */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Vision">
            <CupertinoListTile
              title="Bold Text"
              trailing={
                <CupertinoSwitch
                  value={boldTextLocal}
                  onValueChange={toggleBoldText}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Reduce Motion"
              trailing={
                <CupertinoSwitch
                  value={reduceMotionLocal}
                  onValueChange={toggleReduceMotion}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="High Contrast"
              trailing={
                <CupertinoSwitch
                  value={highContrast}
                  onValueChange={toggleHighContrast}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Reduce Transparency"
              trailing={
                <CupertinoSwitch value={reduceTransparency} onValueChange={setReduceTransparency} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Smart Invert"
              trailing={
                <CupertinoSwitch value={smartInvert} onValueChange={setSmartInvert} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Color Filters"
              trailing={
                <CupertinoSwitch value={colorFilters} onValueChange={setColorFilters} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Larger Text */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Larger Text"
            footer="Adjusts text size within the app. Values between 1.0 and 1.5."
          >
            <CupertinoListTile
              title="Larger Accessibility Sizes"
              trailing={
                <CupertinoSwitch
                  value={largerTextEnabled}
                  onValueChange={toggleLargerText}
                />
              }
              showChevron={false}
            />
            {largerTextEnabled && (
              <View style={styles.sliderRow}>
                <Text style={[typography.caption1, { color: colors.secondaryLabel, width: 32 }]}>
                  A
                </Text>
                <View style={{ flex: 1 }}>
                  <CupertinoSlider
                    value={largerTextScale}
                    onValueChange={handleTextScale}
                    minimumValue={1.0}
                    maximumValue={1.5}
                  />
                </View>
                <Text style={[typography.body, { color: colors.secondaryLabel, width: 32, textAlign: 'right' }]}>
                  A
                </Text>
              </View>
            )}
          </CupertinoListSection>
        </View>

        {/* Text Size — in-app */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Display & Text Size"
            footer="Controls text scaling across the app."
          >
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={TEXT_SIZE_LABELS}
                selectedIndex={settings.textSizeIndex}
                onChange={(i) => update('textSizeIndex', i)}
              />
              <Text style={[typography.caption1, { color: colors.tertiaryLabel, marginTop: 8 }]}>
                Current scale: {Math.round(textScale * 100)}%
              </Text>
            </View>
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          These accessibility preferences apply within the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
});
