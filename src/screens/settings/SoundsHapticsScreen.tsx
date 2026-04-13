// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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

const RINGTONES = ['Opening (Default)', 'Apex', 'Beacon', 'Bulletin', 'By the Seaside', 'Chimes', 'Circuit', 'Constellation', 'Cosmic', 'Crystals', 'Hillside', 'Illuminate', 'Night Owl', 'Presto', 'Radar', 'Radiate', 'Ripples', 'Sencha', 'Signal', 'Silk', 'Slow Rise', 'Stargaze', 'Summit', 'Twinkle', 'Uplift', 'Waves'];
const TEXT_TONES = ['Note (Default)', 'Aurora', 'Bamboo', 'Chord', 'Circles', 'Complete', 'Hello', 'Input', 'Keys', 'Popcorn', 'Pulse', 'Synth', 'Tri-tone'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SoundsHapticsScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showRingtonePicker, setShowRingtonePicker] = useState(false);
  const [showTextTonePicker, setShowTextTonePicker] = useState(false);

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
                  {settings.ringtone}
                </Text>
              }
              onPress={() => setShowRingtonePicker(true)}
            />
            <CupertinoListTile
              title="Text Tone"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {settings.textTone}
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
          label: r,
          onPress: () => { update('ringtone', r); setShowRingtonePicker(false); },
        }))}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={showTextTonePicker}
        onClose={() => setShowTextTonePicker(false)}
        title="Text Tone"
        options={TEXT_TONES.map((t) => ({
          label: t,
          onPress: () => { update('textTone', t); setShowTextTonePicker(false); },
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
