import React, { useCallback, useMemo, useState } from 'react';
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
  CupertinoActionSheet,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

type FocusMode = 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';

interface FocusModeOption {
  key: FocusMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
}

const FOCUS_MODES: FocusModeOption[] = [
  { key: 'off', label: 'Off', icon: 'close-circle', iconBg: '#8E8E93' },
  { key: 'doNotDisturb', label: 'Do Not Disturb', icon: 'moon', iconBg: '#5856D6' },
  { key: 'sleep', label: 'Sleep', icon: 'bed', iconBg: '#5856D6' },
  { key: 'work', label: 'Work', icon: 'briefcase', iconBg: '#34C759' },
  { key: 'personal', label: 'Personal', icon: 'person', iconBg: '#FF9500' },
];

/** Gera as opções de hora 'HH:MM' de 30 em 30 min (00:00 … 23:30). */
function buildHalfHourOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

export function FocusScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const alert = useAlert();

  // Picker de hora para o agendamento (From/To). Opções de 30 em 30 min,
  // formato 'HH:MM' 24h — segue o padrão do ScreenTime (Start/End).
  const HOUR_OPTIONS = useMemo(() => buildHalfHourOptions(), []);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

  const isFocusActive = settings.focusMode !== 'off';
  const activeModeLabel = FOCUS_MODES.find((m) => m.key === settings.focusMode)?.label ?? '';

  const handleSelectMode = useCallback((mode: FocusModeOption) => {
    const wasActive = settings.focusMode !== 'off';
    const willBeActive = mode.key !== 'off';

    // App.tsx's notification listener reads focusMode from a ref before showing
    // any banner, so banners are actually suppressed inside the launcher when
    // focus is active. System-level DND (NotificationManager.setInterruptionFilter)
    // is out of scope — we only gate the launcher's own banner UI.
    update('focusMode', mode.key);

    if (!wasActive && willBeActive) {
      alert(
        'Focus Mode Active',
        `${mode.label} is ON. Notifications are hidden inside the launcher.`,
      );
    } else if (wasActive && !willBeActive) {
      alert('Focus Mode Disabled', 'Focus mode disabled. Notifications restored.');
    }
  }, [settings.focusMode, update, alert]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Focus"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />

      {/* Active focus mode banner */}
      {isFocusActive && (
        <View style={[styles.banner, { backgroundColor: colors.systemPurple ?? '#5856D6' }]}>
          <Ionicons name="moon-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={[typography.footnote, { color: '#fff', flex: 1 }]}>
            Focus mode active – notifications are filtered
          </Text>
          <Text style={[typography.footnote, { color: 'rgba(255,255,255,0.8)', fontWeight: '600' }]}>
            {activeModeLabel}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Focus Modes list */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            header="Focus Modes"
            footer="Focus lets you silence notifications and filter apps based on what you're doing."
          >
            {FOCUS_MODES.map((mode) => {
              const isActive = settings.focusMode === mode.key;
              return (
                <CupertinoListTile
                  key={mode.key}
                  title={mode.label}
                  leading={{
                    name: mode.icon,
                    color: '#FFFFFF',
                    backgroundColor: isActive ? mode.iconBg : colors.systemGray4 ?? '#8E8E93',
                  }}
                  trailing={
                    isActive ? (
                      <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '700' }]}>✓</Text>
                    ) : undefined
                  }
                  showChevron={false}
                  onPress={() => handleSelectMode(mode)}
                />
              );
            })}
          </CupertinoListSection>
        </View>

        {/* Focus Schedule section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Focus Schedule">
            <CupertinoListTile
              title="Focus Schedule"
              trailing={
                <CupertinoSwitch
                  value={settings.focusScheduleEnabled}
                  onValueChange={(v) => update('focusScheduleEnabled', v)}
                />
              }
              showChevron={false}
            />
            {settings.focusScheduleEnabled && (
              <>
                <CupertinoListTile
                  title="From"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.focusScheduleStart}
                    </Text>
                  }
                  onPress={() => setPickerTarget('start')}
                  showChevron={false}
                />
                <CupertinoListTile
                  title="To"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.focusScheduleEnd}
                    </Text>
                  }
                  onPress={() => setPickerTarget('end')}
                  showChevron={false}
                />
              </>
            )}
          </CupertinoListSection>
        </View>

        <CupertinoActionSheet
          visible={pickerTarget !== null}
          onClose={() => setPickerTarget(null)}
          title={pickerTarget === 'start' ? 'From' : 'To'}
          options={HOUR_OPTIONS.map((opt) => ({
            label: opt,
            onPress: () => {
              if (pickerTarget === 'start') update('focusScheduleStart', opt);
              else if (pickerTarget === 'end') update('focusScheduleEnd', opt);
            },
          }))}
          cancelLabel="Cancel"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
