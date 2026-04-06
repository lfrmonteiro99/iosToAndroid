import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LanguageRegionScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { openSystemPanel } = useDevice();

  const trailing = (text: string) => (
    <Text style={[typography.body, { color: colors.secondaryLabel }]}>{text}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Language & Region"
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
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            footer="Apps that support the selected language will use it."
          >
            <CupertinoListTile
              title="Preferred Language"
              trailing={trailing(settings.language)}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Region"
              trailing={trailing(settings.region)}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Calendar"
              trailing={trailing('Gregorian')}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Temperature"
              trailing={trailing('°C')}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Measurement System"
              trailing={trailing('Metric')}
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Number Format"
              trailing={trailing('1,234.56')}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open Language Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('locale')}
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
