import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const TIMEZONE_KEY = '@iostoandroid/timezone';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DateTimeScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null);

  const now = new Date();
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayedTimezone = selectedTimezone ?? detectedTimezone;

  useEffect(() => {
    AsyncStorage.getItem(TIMEZONE_KEY).then((tz) => {
      if (tz) setSelectedTimezone(tz);
    });
  }, []);

  const handleSelectTimezone = (tz: string) => {
    setSelectedTimezone(tz);
    AsyncStorage.setItem(TIMEZONE_KEY, tz);
    setShowTimezoneModal(false);
  };

  const utcOffset = (() => {
    const offset = -now.getTimezoneOffset();
    const h = Math.floor(Math.abs(offset) / 60);
    const m = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT${sign}${h}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''}`;
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Date & Time"
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
        {/* Set Automatically + Time Zone + 24-Hour */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Set Automatically"
              trailing={
                <CupertinoSwitch
                  value={settings.dateTimeAutomatic}
                  onValueChange={(v) => update('dateTimeAutomatic', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Time Zone"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {displayedTimezone}
                </Text>
              }
              showChevron={!settings.dateTimeAutomatic}
              onPress={settings.dateTimeAutomatic ? undefined : () => setShowTimezoneModal(true)}
            />
            <CupertinoListTile
              title="UTC Offset"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {utcOffset}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="24-Hour Time"
              trailing={
                <CupertinoSwitch
                  value={settings.use24Hour}
                  onValueChange={(v) => update('use24Hour', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Current date/time display */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Current Date & Time">
            <CupertinoListTile
              title="Date"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {now.toLocaleDateString()}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Time"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {now.toLocaleTimeString()}
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Calendar format */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Calendar"
            footer={settings.dateTimeAutomatic ? 'Timezone is auto-detected from your device.' : 'Select a timezone to override the system default.'}
          >
            <CupertinoListTile
              title="Calendar"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Gregorian</Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>

      {/* Timezone Picker Modal */}
      <Modal
        visible={showTimezoneModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimezoneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Pressable onPress={() => setShowTimezoneModal(false)}>
                <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
              </Pressable>
              <Text style={[typography.headline, { color: colors.label }]}>Time Zone</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {COMMON_TIMEZONES.map((tz) => (
                <TouchableOpacity
                  key={tz}
                  style={[
                    styles.tzRow,
                    { borderBottomColor: colors.separator },
                    displayedTimezone === tz && { backgroundColor: colors.systemBlue + '18' },
                  ]}
                  onPress={() => handleSelectTimezone(tz)}
                >
                  <Text style={[typography.body, { color: colors.label, flex: 1 }]}>{tz}</Text>
                  {displayedTimezone === tz && (
                    <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '700' }]}>
                      {'\u2713'}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
