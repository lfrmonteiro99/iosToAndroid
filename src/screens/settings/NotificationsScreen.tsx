import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useApps } from '../../store/AppsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
  CupertinoActionSheet,
} from '../../components';
import {
  APP_DELIVERY_LABELS,
  APP_DELIVERY_POLICIES,
  policyLabelFor,
  type AppDeliveryPolicy,
} from '../../utils/notificationAppRules';
import type { AppNavigationProp } from '../../navigation/types';

const PREVIEW_VALUES = ['always', 'whenUnlocked', 'never'] as const;
const PREVIEW_LABELS = ['Always', 'When Unlocked', 'Never'];
const SUMMARY_OPTIONS = ['Off', 'Morning (8:00 AM)', 'Evening (6:00 PM)', 'Both'];

export function NotificationsScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { apps } = useApps();
  const [summaryIdx, setSummaryIdx] = useState(settings.scheduledSummaryIdx ?? 0);
  const [showSummaryPicker, setShowSummaryPicker] = useState(false);

  // Per-app delivery (#630): segmented control por app que escolhe a política
  // Immediate/Scheduled/Digest/Blocked. A linha-resumo mostra a política actual.
  const [deliveryPickerPkg, setDeliveryPickerPkg] = useState<string | null>(null);

  const previewIndex = PREVIEW_VALUES.indexOf(settings.notificationPreviews);

  const handleSetPolicy = (pkg: string, policy: AppDeliveryPolicy) => {
    const current = settings.perAppDelivery ?? {};
    update('perAppDelivery', { ...current, [pkg]: policy });
  };

  const deliveryOptions = useMemo(() => {
    if (!deliveryPickerPkg) return [];
    const current = settings.perAppDelivery?.[deliveryPickerPkg] ?? 'immediate';
    return APP_DELIVERY_POLICIES.map((policy) => ({
      label: `${policy === current ? '✓ ' : ''}${APP_DELIVERY_LABELS[policy]}`,
      onPress: () => handleSetPolicy(deliveryPickerPkg, policy),
    }));
  }, [deliveryPickerPkg, settings.perAppDelivery]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Notifications"
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
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Allow Notifications"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationsEnabled}
                  onValueChange={(v) => update('notificationsEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Show Previews">
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={PREVIEW_LABELS}
                selectedIndex={previewIndex >= 0 ? previewIndex : 0}
                onChange={(i) => update('notificationPreviews', PREVIEW_VALUES[i])}
              />
            </View>
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Sounds"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationSounds}
                  onValueChange={(v) => update('notificationSounds', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Badges"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationBadges}
                  onValueChange={(v) => update('notificationBadges', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Scheduled Summary"
            footer="Deliver notifications in scheduled batches to reduce interruptions."
          >
            <CupertinoListTile
              title="Scheduled Summary"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {SUMMARY_OPTIONS[summaryIdx]}
                </Text>
              }
              onPress={() => setShowSummaryPicker(true)}
            />
          </CupertinoListSection>
        </View>

        {/* Reduce Interruptions (#630): embala tudo o que não está na allow-list
            do Focus. Ligado ao mesmo Scheduled Summary que a linha acima — um
            resumo «Both» faz sentido com isto activo. */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Reduce Interruptions"
            footer="Deliver all notifications in scheduled batches except apps you allow in Focus."
          >
            <CupertinoListTile
              title="Reduce Interruptions"
              trailing={
                <CupertinoSwitch
                  value={settings.reduceInterruptions}
                  onValueChange={(v) => update('reduceInterruptions', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Per-app delivery (#630): política Immediate/Scheduled/Digest/Blocked
            por app. A allow-list imediata (Focus) e o Reduce Interruptions são
            geridos noutros ecrãs; aqui define-se a política base de cada app. */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Notification Delivery"
            footer="Choose how each app delivers notifications: immediately, in scheduled batches, or never."
          >
            {apps.map((app) => (
              <CupertinoListTile
                key={app.packageName}
                title={app.name}
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {policyLabelFor(settings.perAppDelivery, app.packageName)}
                  </Text>
                }
                onPress={() => setDeliveryPickerPkg(app.packageName)}
              />
            ))}
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showSummaryPicker}
        onClose={() => setShowSummaryPicker(false)}
        title="Scheduled Summary"
        options={SUMMARY_OPTIONS.map((label, i) => ({
          label,
          onPress: () => { setSummaryIdx(i); update('scheduledSummaryIdx', i); setShowSummaryPicker(false); },
        }))}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={deliveryPickerPkg !== null}
        onClose={() => setDeliveryPickerPkg(null)}
        title="Notification Delivery"
        message={deliveryPickerPkg ? `How ${deliveryPickerPkg} delivers notifications` : undefined}
        options={deliveryOptions}
        cancelLabel="Done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
