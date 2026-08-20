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

const REGION_STORAGE_KEY = '@iostoandroid/region';

export function LanguageRegionScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { update } = useSettings();
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarType, setCalendarType] = useState('Gregorian');
  const [selectedRegion, setSelectedRegion] = useState<string>('US');

  // Load persisted region preference
  useEffect(() => {
    AsyncStorage.getItem(REGION_STORAGE_KEY).then((region) => {
      if (region) setSelectedRegion(region);
    }).catch(() => {});
  }, []);

  const handleSelectRegion = useCallback((code: string, regionName: string) => {
    setSelectedRegion(code);
    update('region', regionName);
    AsyncStorage.setItem(REGION_STORAGE_KEY, code).catch(() => {});
    setShowRegionPicker(false);
  }, [update]);

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
        {/* Region section */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
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
