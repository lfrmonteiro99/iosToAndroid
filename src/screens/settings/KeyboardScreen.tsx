import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const KBD_KEYS = {
  autocap: '@iostoandroid/kbd_autocap',
  autocorrect: '@iostoandroid/kbd_autocorrect',
  clicks: '@iostoandroid/kbd_clicks',
  predictive: '@iostoandroid/kbd_predictive',
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function KeyboardScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const [smartPunctuation, setSmartPunctuation] = useState(true);
  const [dictation, setDictation] = useState(true);

  // In-app keyboard preferences stored in AsyncStorage
  const [autoCap, setAutoCap] = useState(true);
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [keyClicks, setKeyClicks] = useState(false);
  const [predictive, setPredictive] = useState(true);

  useEffect(() => {
    AsyncStorage.multiGet(Object.values(KBD_KEYS)).then((pairs) => {
      const map: Record<string, string | null> = {};
      for (const [k, v] of pairs) map[k] = v;
      if (map[KBD_KEYS.autocap] !== null) setAutoCap(map[KBD_KEYS.autocap] !== 'false');
      if (map[KBD_KEYS.autocorrect] !== null) setAutoCorrect(map[KBD_KEYS.autocorrect] !== 'false');
      if (map[KBD_KEYS.clicks] !== null) setKeyClicks(map[KBD_KEYS.clicks] === 'true');
      if (map[KBD_KEYS.predictive] !== null) setPredictive(map[KBD_KEYS.predictive] !== 'false');
    });
  }, []);

  const toggle = useCallback((key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    AsyncStorage.setItem(key, String(value));
  }, []);

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
        {/* In-app keyboard preferences */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="Keyboard Preferences">
            <CupertinoListTile
              title="Auto-Capitalize"
              trailing={
                <CupertinoSwitch
                  value={autoCap}
                  onValueChange={(v) => toggle(KBD_KEYS.autocap, v, setAutoCap)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Auto-Correction"
              trailing={
                <CupertinoSwitch
                  value={autoCorrect}
                  onValueChange={(v) => toggle(KBD_KEYS.autocorrect, v, setAutoCorrect)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Key Clicks"
              trailing={
                <CupertinoSwitch
                  value={keyClicks}
                  onValueChange={(v) => toggle(KBD_KEYS.clicks, v, setKeyClicks)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Predictive Text"
              trailing={
                <CupertinoSwitch
                  value={predictive}
                  onValueChange={(v) => toggle(KBD_KEYS.predictive, v, setPredictive)}
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

        {/* Advanced — system delegate, clearly labelled */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Advanced Keyboard Settings (System)"
              leading={{
                name: 'settings-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGray,
              }}
              showChevron
              onPress={() => openSystemPanel('input_method')}
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
