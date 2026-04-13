import React, { useState } from 'react';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function KeyboardScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [smartPunctuation, setSmartPunctuation] = useState(true);
  const [dictation, setDictation] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Keyboards"
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
        {/* All Keyboards */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="All Keyboards">
            <CupertinoListTile
              title="Auto-Correction"
              trailing={
                <CupertinoSwitch
                  value={settings.keyboardAutoCorrect}
                  onValueChange={(v) => update('keyboardAutoCorrect', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Auto-Capitalization"
              trailing={
                <CupertinoSwitch
                  value={settings.keyboardAutoCapitalize}
                  onValueChange={(v) => update('keyboardAutoCapitalize', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Predictive"
              trailing={
                <CupertinoSwitch
                  value={settings.keyboardPredictive}
                  onValueChange={(v) => update('keyboardPredictive', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Smart Punctuation + Dictation */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer="Double-tap the space bar to insert a period."
          >
            <CupertinoListTile
              title="Smart Punctuation"
              trailing={
                <CupertinoSwitch value={smartPunctuation} onValueChange={setSmartPunctuation} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Enable Dictation"
              trailing={
                <CupertinoSwitch value={dictation} onValueChange={setDictation} />
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
