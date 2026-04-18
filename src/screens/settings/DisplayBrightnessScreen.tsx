import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
  CupertinoActionSheet,
  CupertinoSlider,
} from '../../components';

const NIGHT_SHIFT_KEY = '@iostoandroid/night_shift';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DisplayBrightnessScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing, isDark, toggleTheme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { brightness, setBrightness } = useDevice();
  const [showAutoLock, setShowAutoLock] = useState(false);
  const [nightShiftEnabled, setNightShiftEnabled] = useState(false);
  const [nightShiftIntensity, setNightShiftIntensity] = useState(0.5);

  useEffect(() => {
    AsyncStorage.getItem(NIGHT_SHIFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') setNightShiftEnabled(parsed.enabled);
        if (typeof parsed.intensity === 'number') setNightShiftIntensity(parsed.intensity);
      } catch { /* ignore */ }
    });
  }, []);

  const saveNightShift = (enabled: boolean, intensity: number) => {
    AsyncStorage.setItem(NIGHT_SHIFT_KEY, JSON.stringify({ enabled, intensity }));
  };

  const handleNightShiftToggle = (v: boolean) => {
    setNightShiftEnabled(v);
    saveNightShift(v, nightShiftIntensity);
  };

  const handleNightShiftIntensity = (v: number) => {
    setNightShiftIntensity(v);
    saveNightShift(nightShiftEnabled, v);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Display & Brightness"
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
        {/* Brightness slider */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Brightness">
            <View style={styles.sliderRow}>
              <Ionicons name="sunny-outline" size={20} color={colors.secondaryLabel} />
              <View style={styles.sliderTrack}>
                <CupertinoSlider
                  value={brightness}
                  onValueChange={(v) => setBrightness(v)}
                  minimumValue={0}
                  maximumValue={1}
                />
              </View>
              <Ionicons name="sunny" size={20} color={colors.secondaryLabel} />
            </View>
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Appearance">
            <View style={{ padding: spacing.md }}>
              <View style={styles.appearanceRow}>
                <View style={styles.appearanceOption}>
                  <View style={[
                    styles.phoneMock,
                    { backgroundColor: '#FFFFFF', borderColor: !isDark ? colors.systemBlue : colors.systemGray4 },
                  ]}>
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA', width: '60%' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA', width: '80%' }]} />
                  </View>
                  <Text style={[typography.caption1, { color: colors.label, marginTop: 8 }]}>Light</Text>
                </View>
                <View style={styles.appearanceOption}>
                  <View style={[
                    styles.phoneMock,
                    { backgroundColor: '#1C1C1E', borderColor: isDark ? colors.systemBlue : colors.systemGray4 },
                  ]}>
                    <View style={[styles.mockLine, { backgroundColor: '#38383A' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#38383A', width: '60%' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#38383A', width: '80%' }]} />
                  </View>
                  <Text style={[typography.caption1, { color: colors.label, marginTop: 8 }]}>Dark</Text>
                </View>
              </View>
            </View>
            <CupertinoListTile
              title="Dark Mode"
              trailing={<CupertinoSwitch value={isDark} onValueChange={toggleTheme} />}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Text Size">
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={['Small', 'Default', 'Large']}
                selectedIndex={settings.textSizeIndex}
                onChange={(i) => update('textSizeIndex', i)}
              />
            </View>
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="True Tone"
              trailing={
                <CupertinoSwitch
                  value={settings.trueTone}
                  onValueChange={(v) => update('trueTone', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Auto-Lock"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {settings.autoLock}
                </Text>
              }
              onPress={() => setShowAutoLock(true)}
            />
            <CupertinoListTile
              title="Raise to Wake"
              trailing={
                <CupertinoSwitch
                  value={settings.raiseToWake}
                  onValueChange={(v) => update('raiseToWake', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Night Shift (in-app) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Night Shift"
            footer="Night Shift schedule and intensity are saved. Blue light filter requires system support."
          >
            <CupertinoListTile
              title="Night Shift"
              trailing={
                <CupertinoSwitch
                  value={nightShiftEnabled}
                  onValueChange={handleNightShiftToggle}
                />
              }
              showChevron={false}
            />
            {nightShiftEnabled && (
              <View style={styles.sliderRow}>
                <Ionicons name="sunny-outline" size={18} color={colors.systemOrange} />
                <View style={styles.sliderTrack}>
                  <CupertinoSlider
                    value={nightShiftIntensity}
                    onValueChange={handleNightShiftIntensity}
                    minimumValue={0}
                    maximumValue={1}
                  />
                </View>
                <Ionicons name="sunny" size={18} color={colors.systemOrange} />
              </View>
            )}
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showAutoLock}
        onClose={() => setShowAutoLock(false)}
        title="Auto-Lock"
        options={[
          { label: '30 Seconds', onPress: () => { update('autoLock', '30 Seconds'); setShowAutoLock(false); } },
          { label: '1 Minute', onPress: () => { update('autoLock', '1 Minute'); setShowAutoLock(false); } },
          { label: '2 Minutes', onPress: () => { update('autoLock', '2 Minutes'); setShowAutoLock(false); } },
          { label: '3 Minutes', onPress: () => { update('autoLock', '3 Minutes'); setShowAutoLock(false); } },
          { label: '5 Minutes', onPress: () => { update('autoLock', '5 Minutes'); setShowAutoLock(false); } },
          { label: 'Never', onPress: () => { update('autoLock', 'Never'); setShowAutoLock(false); } },
        ]}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sliderTrack: {
    flex: 1,
  },
  appearanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  appearanceOption: {
    alignItems: 'center',
  },
  phoneMock: {
    width: 70,
    height: 120,
    borderRadius: 12,
    borderWidth: 2.5,
    padding: 10,
    justifyContent: 'center',
    gap: 6,
  },
  mockLine: {
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
});
