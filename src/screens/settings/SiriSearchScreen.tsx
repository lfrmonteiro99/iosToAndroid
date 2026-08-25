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
import type { AppNavigationProp } from '../../navigation/types';

/**
 * Siri & Search (#610). No iOS controla sugestões globais e a visibilidade das
 * apps na procura e na App Library. Aqui os três toggles são globais (o iOS
 * tem-nos também por-app; o launcher já resolve o caso por-app com hideApp()
 * do #606, por isso não se duplica isso aqui).
 */
export function SiriSearchScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Siri & Search"
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
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            header="Suggestions"
            footer="Siri can make suggestions in Search and on the Home Screen."
          >
            <CupertinoListTile
              title="Show Suggestions"
              trailing={
                <CupertinoSwitch
                  value={settings.searchShowSuggestions}
                  onValueChange={(v) => update('searchShowSuggestions', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Apps"
            footer="Turn these off to keep apps out of Search results and out of the App Library. Apps stay installed and launchable."
          >
            <CupertinoListTile
              title="Show Apps in Search"
              trailing={
                <CupertinoSwitch
                  value={settings.searchShowInSearch}
                  onValueChange={(v) => update('searchShowInSearch', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Show Apps in App Library"
              trailing={
                <CupertinoSwitch
                  value={settings.searchShowInLibrary}
                  onValueChange={(v) => update('searchShowInLibrary', v)}
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
