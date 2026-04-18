import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoActionSheet,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: 'en-US', name: 'English (US)', native: 'English (US)' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', native: '中文(简体)' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
];

const REGIONS: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'ES', name: 'Spain' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
];

const CALENDAR_TYPES = ['Gregorian', 'Japanese', 'Buddhist', 'Hebrew', 'Islamic'];

const LANG_STORAGE_KEY = '@iostoandroid/language';
const REGION_STORAGE_KEY = '@iostoandroid/region';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LanguageRegionScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { update } = useSettings();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarType, setCalendarType] = useState('Gregorian');
  const [selectedLang, setSelectedLang] = useState<string>('en-US');
  const [selectedRegion, setSelectedRegion] = useState<string>('US');

  // Load persisted language/region preferences
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(LANG_STORAGE_KEY),
      AsyncStorage.getItem(REGION_STORAGE_KEY),
    ]).then(([lang, region]) => {
      if (lang) setSelectedLang(lang);
      if (region) setSelectedRegion(region);
    }).catch(() => {});
  }, []);

  const handleSelectLanguage = useCallback((code: string, displayName: string) => {
    setSelectedLang(code);
    update('language', displayName);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code).catch(() => {});
    setShowLangPicker(false);
  }, [update]);

  const handleSelectRegion = useCallback((code: string, regionName: string) => {
    setSelectedRegion(code);
    update('region', regionName);
    AsyncStorage.setItem(REGION_STORAGE_KEY, code).catch(() => {});
    setShowRegionPicker(false);
  }, [update]);

  const currentLang = LANGUAGES.find((l) => l.code === selectedLang) ?? LANGUAGES[0];
  const currentRegion = REGIONS.find((r) => r.code === selectedRegion) ?? REGIONS[0];

  const trailing = (text: string) => (
    <Text style={[typography.body, { color: colors.secondaryLabel }]}>{text}</Text>
  );

  // Derive locale-based values from the JS runtime
  const localeInfo = useMemo(() => {
    const locale = Platform.OS === 'android'
      ? (NativeModules.I18nManager?.localeIdentifier ?? 'en_US')
      : 'en_US';
    const usesMetric = !['US', 'LR', 'MM'].includes(selectedRegion);
    const tempUnit = usesMetric ? '°C' : '°F';
    const measurement = usesMetric ? 'Metric' : 'US';
    // Format a sample number using the device locale
    let numberFormat = '1,234.56';
    try { numberFormat = (1234.56).toLocaleString(locale.replace('_', '-')); } catch { /* ignore */ }
    return { tempUnit, measurement, numberFormat };
  }, [selectedRegion]);

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
        {/* Language section */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            header="Language"
            footer="Language preference affects app text display. Restart the app to apply changes."
          >
            {LANGUAGES.map((lang) => (
              <CupertinoListTile
                key={lang.code}
                title={lang.name}
                subtitle={lang.native !== lang.name ? lang.native : undefined}
                trailing={
                  selectedLang === lang.code ? (
                    <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>✓</Text>
                  ) : undefined
                }
                showChevron={false}
                onPress={() => handleSelectLanguage(lang.code, lang.name)}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Region section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Region"
            footer="Region affects number, date, and currency formats."
          >
            {REGIONS.map((region) => (
              <CupertinoListTile
                key={region.code}
                title={region.name}
                trailing={
                  selectedRegion === region.code ? (
                    <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>✓</Text>
                  ) : undefined
                }
                showChevron={false}
                onPress={() => handleSelectRegion(region.code, region.name)}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Locale info section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Format Preview"
            footer="These preferences control formatting within the app."
          >
            <CupertinoListTile
              title="Preferred Language"
              trailing={trailing(`${currentLang.name} (${currentLang.native})`)}
              onPress={() => setShowLangPicker(true)}
            />
            <CupertinoListTile
              title="Region"
              trailing={trailing(currentRegion.name)}
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
          label: `${l.name} — ${l.native}`,
          onPress: () => handleSelectLanguage(l.code, l.name),
        }))}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={showRegionPicker}
        onClose={() => setShowRegionPicker(false)}
        title="Region"
        options={REGIONS.map((r) => ({
          label: r.name,
          onPress: () => handleSelectRegion(r.code, r.name),
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
