// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React, { useCallback } from 'react';
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
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

type FocusMode = 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';

interface FocusModeOption {
  key: FocusMode;
  label: string;
  icon: string;
  iconBg: string;
}

const FOCUS_MODES: FocusModeOption[] = [
  { key: 'off', label: 'Off', icon: 'close-circle', iconBg: '#8E8E93' },
  { key: 'doNotDisturb', label: 'Do Not Disturb', icon: 'moon', iconBg: '#5856D6' },
  { key: 'sleep', label: 'Sleep', icon: 'bed', iconBg: '#5856D6' },
  { key: 'work', label: 'Work', icon: 'briefcase', iconBg: '#34C759' },
  { key: 'personal', label: 'Personal', icon: 'person', iconBg: '#FF9500' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FocusScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const alert = useAlert();

  const isFocusActive = settings.focusMode !== 'off';
  const activeModeLabel = FOCUS_MODES.find((m) => m.key === settings.focusMode)?.label ?? '';

  const handleSelectMode = useCallback((mode: FocusModeOption) => {
    const wasActive = settings.focusMode !== 'off';
    const willBeActive = mode.key !== 'off';

    // NOTE: Actual notification silencing requires native Android integration
    // (NotificationManager.setInterruptionFilter or similar). Here we only
    // update the in-app focus state and inform the user of the simulated effect.
    update('focusMode', mode.key);

    if (!wasActive && willBeActive) {
      alert(
        'Focus Mode Active',
        `${mode.label} is ON. Notifications will be silenced.`,
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    name: mode.icon as any,
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
          </CupertinoListSection>
        </View>
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
