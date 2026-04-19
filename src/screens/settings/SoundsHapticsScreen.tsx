// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSlider,
  CupertinoActionSheet,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const RINGTONES = ['Opening', 'Chimes', 'Marimba', 'Reflection', 'Ripple', 'Silk', 'By the Seaside', 'Night Owl'];
const TEXT_TONES = ['Note (Default)', 'Aurora', 'Bamboo', 'Chord', 'Circles', 'Complete', 'Hello', 'Input', 'Keys', 'Popcorn', 'Pulse', 'Synth', 'Tri-tone'];

const RINGTONE_STORAGE_KEY = '@iostoandroid/ringtone';
const TEXT_TONE_STORAGE_KEY = '@iostoandroid/text_tone';
const SYSTEM_HAPTICS_STORAGE_KEY = '@iostoandroid/system_haptics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SoundsHapticsScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showRingtonePicker, setShowRingtonePicker] = useState(false);
  const [showTextTonePicker, setShowTextTonePicker] = useState(false);
  const [systemHaptics, setSystemHaptics] = useState(true);
  // Local ringtone/text tone state (backed by AsyncStorage)
  const [ringtone, setRingtone] = useState(settings.ringtone || 'Reflection');
  const [textTone, setTextTone] = useState(settings.textTone || 'Note');

  // Load persisted values on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(RINGTONE_STORAGE_KEY),
      AsyncStorage.getItem(TEXT_TONE_STORAGE_KEY),
      AsyncStorage.getItem(SYSTEM_HAPTICS_STORAGE_KEY),
    ]).then(([rt, tt, haptics]) => {
      if (rt) { setRingtone(rt); update('ringtone', rt); }
      if (tt) { setTextTone(tt); update('textTone', tt); }
      if (haptics !== null) setSystemHaptics(haptics !== 'false');
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectRingtone = (r: string) => {
    setRingtone(r);
    update('ringtone', r);
    AsyncStorage.setItem(RINGTONE_STORAGE_KEY, r).catch(() => {});
    setShowRingtonePicker(false);
  };

  const handleSelectTextTone = (t: string) => {
    setTextTone(t);
    update('textTone', t);
    AsyncStorage.setItem(TEXT_TONE_STORAGE_KEY, t).catch(() => {});
    setShowTextTonePicker(false);
  };

  const handleSystemHapticsToggle = (val: boolean) => {
    setSystemHaptics(val);
    AsyncStorage.setItem(SYSTEM_HAPTICS_STORAGE_KEY, val ? 'true' : 'false').catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Sounds & Haptics"
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
        {/* Ringtone & Vibration section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Ringtone & Vibration">
            {/* Volume slider */}
            <View style={styles.sliderRow}>
              <Ionicons name="volume-low" size={20} color={colors.secondaryLabel} />
              <View style={styles.sliderTrack}>
                <CupertinoSlider
                  value={settings.volume}
                  onValueChange={(v) => update('volume', v)}
                  minimumValue={0}
                  maximumValue={1}
                />
              </View>
              <Ionicons name="volume-high" size={20} color={colors.secondaryLabel} />
            </View>
            <CupertinoListTile
              title="Ringtone"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {ringtone}
                </Text>
              }
              onPress={() => setShowRingtonePicker(true)}
            />
            <CupertinoListTile
              title="Text Tone"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {textTone}
                </Text>
              }
              onPress={() => setShowTextTonePicker(true)}
            />
          </CupertinoListSection>
        </View>

        {/* Haptics section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Haptics">
            <CupertinoListTile
              title="System Haptics"
              trailing={
                <CupertinoSwitch
                  value={systemHaptics}
                  onValueChange={handleSystemHapticsToggle}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Vibration"
              trailing={
                <CupertinoSwitch
                  value={settings.vibration}
                  onValueChange={(v) => update('vibration', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Keyboard Clicks"
              trailing={
                <CupertinoSwitch
                  value={settings.keyboardClicks}
                  onValueChange={(v) => update('keyboardClicks', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Lock Sound"
              trailing={
                <CupertinoSwitch
                  value={settings.lockSound}
                  onValueChange={(v) => update('lockSound', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showRingtonePicker}
        onClose={() => setShowRingtonePicker(false)}
        title="Ringtone"
        options={RINGTONES.map((r) => ({
          label: r === ringtone ? `${r} ✓` : r,
          onPress: () => handleSelectRingtone(r),
        }))}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={showTextTonePicker}
        onClose={() => setShowTextTonePicker(false)}
        title="Text Tone"
        options={TEXT_TONES.map((t) => ({
          label: t === textTone ? `${t} ✓` : t,
          onPress: () => handleSelectTextTone(t),
        }))}
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
});
