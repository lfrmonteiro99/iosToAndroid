import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { AppNavigationProp } from '../navigation/types';

import { useTheme } from '../theme/ThemeContext';
import { useApps } from '../store/AppsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../components';

/**
 * #627 — "Protected Apps": qualquer app na lista exige biometria (via
 * AppsStore.launchApp, ver useApps().protectApp/unprotectApp) antes de abrir.
 *
 * Não há AccessibilityService aqui: o gate cobre todos os caminhos de abertura
 * que já passam por launchApp() (grelha, App Library, pesquisa, Siri, recentes),
 * mas não intercepta o multitasking nativo do Android — reabrir a app pela
 * lista de apps recentes do sistema contorna o gate. É uma limitação conhecida
 * e aceite pelo próprio issue ("app normal não tem controlo absoluto").
 */
export function ProtectedAppsScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, protectedApps, protectApp, unprotectApp } = useApps();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Protected Apps"
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: spacing.sm }]}>
            Apps na lista pedem Face ID / impressão digital antes de abrir.
          </Text>
          {apps.length === 0 ? (
            <CupertinoListSection>
              <CupertinoListTile title="No apps found" showChevron={false} isLast />
            </CupertinoListSection>
          ) : (
            <CupertinoListSection>
              {apps.map((app, i) => {
                const isProtected = (protectedApps ?? []).includes(app.packageName);
                return (
                  <CupertinoListTile
                    key={app.packageName}
                    title={app.name}
                    showChevron={false}
                    isLast={i === apps.length - 1}
                    trailing={
                      <CupertinoSwitch
                        value={isProtected}
                        onValueChange={(v) => (v ? protectApp?.(app.packageName) : unprotectApp?.(app.packageName))}
                      />
                    }
                  />
                );
              })}
            </CupertinoListSection>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
