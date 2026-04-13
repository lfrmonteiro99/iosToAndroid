import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, NativeModules, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoActionSheet,
} from '../../components';

const LANGUAGES = ['English', 'Português', 'Español', 'Français', 'Deutsch', 'Italiano', '日本語', '中文', 'Русский', 'العربية'];
const REGIONS = ['US', 'PT', 'ES', 'FR', 'DE', 'IT', 'JP', 'CN', 'RU', 'BR', 'MX', 'GB'];
const CALENDAR_TYPES = ['Gregorian', 'Japanese', 'Buddhist', 'Hebrew', 'Islamic'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LanguageRegionScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarType, setCalendarType] = useState('Gregorian');

  const trailing = (text: string) => (
    <Text style={[typography.body, { color: colors.secondaryLabel }]}>{text}</Text>
  );

  // Derive locale-based values from the JS runtime
  const localeInfo = useMemo(() => {
    const locale = Platform.OS === 'android'
      ? (NativeModules.I18nManager?.localeIdentifier ?? 'en_US')
      : 'en_US';
    const usesMetric = !['US', 'LR', 'MM'].includes(settings.region);
    const tempUnit = usesMetric ? '°C' : '°F';
    const measurement = usesMetric ? 'Metric' : 'US';
    // Format a sample number using the device locale
    let numberFormat = '1,234.56';
    try { numberFormat = (1234.56).toLocaleString(locale.replace('_', '-')); } catch { /* ignore */ }
    return { tempUnit, measurement, numberFormat };
  }, [settings.region]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Language & Region"
        largeTitle={false}
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            General
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            footer="These preferences control formatting within the app."
          >
            <CupertinoListTile
              title="Preferred Language"
              trailing={trailing(settings.language)}
              onPress={() => setShowLangPicker(true)}
            />
            <CupertinoListTile
              title="Region"
              trailing={trailing(settings.region)}
              onPress={() => setShowRegionPicker(true)}
            />
            <CupertinoListTile
              title="Calendar"
              trailing={trailing(calendarType)}
              onPress={() => setShowCalendarPicker(true)}
            />
            <CupertinoListTile
              title="Temperature"
              trailing={trailing(localeInfo.tempUnit)}
              showChevron={false}
            />
            <CupertinoListTile
              title="Measurement System"
              trailing={trailing(localeInfo.measurement)}
              showChevron={false}
            />
            <CupertinoListTile
              title="Number Format"
              trailing={trailing(localeInfo.numberFormat)}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showLangPicker}
        onClose={() => setShowLangPicker(false)}
        title="Preferred Language"
        options={LANGUAGES.map((l) => ({
          label: l,
          onPress: () => { update('language', l); setShowLangPicker(false); },
        }))}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={showRegionPicker}
        onClose={() => setShowRegionPicker(false)}
        title="Region"
        options={REGIONS.map((r) => ({
          label: r,
          onPress: () => { update('region', r); setShowRegionPicker(false); },
        }))}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={showCalendarPicker}
        onClose={() => setShowCalendarPicker(false)}
        title="Calendar"
        options={CALENDAR_TYPES.map((c) => ({
          label: c,
          onPress: () => { setCalendarType(c); setShowCalendarPicker(false); },
        }))}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
