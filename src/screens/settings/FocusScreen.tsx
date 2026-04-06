// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

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
export function FocusScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

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
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Focus Modes list */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Focus Modes"
            footer="Focus lets you silence notifications and filter apps based on what you're doing."
          >
            {FOCUS_MODES.map((mode) => (
              <CupertinoListTile
                key={mode.key}
                title={mode.label}
                leading={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  name: mode.icon as any,
                  color: '#FFFFFF',
                  backgroundColor: mode.iconBg,
                }}
                trailing={
                  settings.focusMode === mode.key ? (
                    <Text style={[typography.body, { color: colors.systemBlue }]}>✓</Text>
                  ) : undefined
                }
                showChevron={false}
                onPress={() => update('focusMode', mode.key)}
              />
            ))}
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
});
