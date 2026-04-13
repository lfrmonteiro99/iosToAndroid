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
  CupertinoSegmentedControl,
} from '../../components';

const TEXT_SIZE_LABELS = ['Small', 'Default', 'Large', 'XL'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AccessibilityScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing, textScale } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [smartInvert, setSmartInvert] = useState(false);
  const [colorFilters, setColorFilters] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Accessibility"
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
        {/* Vision — in-app controls */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Vision">
            <CupertinoListTile
              title="Bold Text"
              trailing={
                <CupertinoSwitch
                  value={settings.boldText}
                  onValueChange={(v) => update('boldText', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Reduce Motion"
              trailing={
                <CupertinoSwitch
                  value={settings.reduceMotion}
                  onValueChange={(v) => update('reduceMotion', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Increase Contrast"
              trailing={
                <CupertinoSwitch
                  value={settings.boldText && settings.reduceMotion}
                  onValueChange={() => {
                    update('boldText', true);
                    update('reduceMotion', true);
                  }}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Reduce Transparency"
              trailing={
                <CupertinoSwitch value={reduceTransparency} onValueChange={setReduceTransparency} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Smart Invert"
              trailing={
                <CupertinoSwitch value={smartInvert} onValueChange={setSmartInvert} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Color Filters"
              trailing={
                <CupertinoSwitch value={colorFilters} onValueChange={setColorFilters} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Text Size — in-app */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Display & Text Size"
            footer="Controls text scaling across the app."
          >
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={TEXT_SIZE_LABELS}
                selectedIndex={settings.textSizeIndex}
                onChange={(i) => update('textSizeIndex', i)}
              />
              <Text style={[typography.caption1, { color: colors.tertiaryLabel, marginTop: 8 }]}>
                Current scale: {Math.round(textScale * 100)}%
              </Text>
            </View>
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          These accessibility preferences apply within the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
