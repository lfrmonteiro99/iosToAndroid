import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { CupertinoNavigationBar, CupertinoCard, useAlert } from '../../components';
import { GlassSurface } from '../../components/GlassSurface';
import {
  toPrivacySensorViews,
  type PrivacySensorView,
} from '../../utils/privacyMonitor';
import LauncherModule from '../../../modules/launcher-module/src';
import type { PrivacyReport } from '../../../modules/launcher-module/src';
import type { AppNavigationProp } from '../../navigation/types';

// #624 — Privacy Monitor dashboard. One card per privacy sensor (📷/🎤/📍/🌐)
// showing the apps that declare that permission in their manifest; tapping a
// card expands the per-app list (count is always 1 — this is set-membership,
// not usage tallies). Reuses CupertinoCard + GlassSurface so it matches the
// rest of the settings chrome.
// No bar/length is shown per app: with count fixed at 1, any per-app ratio
// would be a constant 100% and convey no information. The `ratio` field still
// exists in privacyMonitor.ts for unit tests, but the UI does not consume it
// (#635-SI4).
const SENSOR_ORDER: PrivacyReport['sensors'][number]['sensor'][] = [
  'camera',
  'microphone',
  'location',
  'network',
];

function PrivacySensorCard({
  view,
  expanded,
  onToggle,
}: {
  view: PrivacySensorView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;

  const rows = expanded ? view.breakdown : [];

  return (
    <CupertinoCard style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${view.label}: ${view.appCount} ${view.appCount === 1 ? 'app' : 'apps'} com permissão. ${expanded ? 'Recolher' : 'Expandir'} por app`}
        style={({ pressed }) => [
          styles.cardHeader,
          pressed && { opacity: 0.6 },
        ]}
      >
        <View style={[styles.sensorIcon, { backgroundColor: view.bg }]}>
          <Ionicons name={view.icon as keyof typeof Ionicons.glyphMap} size={22} color="#FFFFFF" />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[typography.headline, { color: colors.label }]}>
            {view.label}
          </Text>
          <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>
            {view.hasAccesses
              ? `${view.appCount} ${view.appCount === 1 ? 'app' : 'apps'} com permissão`
              : 'Sem apps com permissão'}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.tertiaryLabel}
          style={{ marginLeft: spacing.sm }}
        />
      </Pressable>

      {expanded && (
        <View style={styles.breakdown}>
          {view.hasAccesses ? (
            rows.map((row) => (
              <View key={row.packageName} style={styles.appRow}>
                <View style={styles.appRowHead}>
                  <Text
                    style={[typography.subhead, { color: colors.label, flex: 1 }]}
                    numberOfLines={1}
                    accessibilityLabel={row.appName}
                  >
                    {row.appName}
                  </Text>
                </View>
                <Text
                  style={[typography.footnote, { color: colors.tertiaryLabel }]}
                  numberOfLines={1}
                >
                  {row.packageName}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[typography.footnote, { color: colors.tertiaryLabel, paddingTop: spacing.sm }]}>
              Nenhuma app com permissão registada.
            </Text>
          )}
        </View>
      )}
    </CupertinoCard>
  );
}

export function PrivacyMonitorScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await LauncherModule.getPrivacyReport();
      setReport(data);
    } catch {
      alert('Erro', 'Não foi possível carregar o relatório de privacidade.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    load();
  }, [load]);

  const views = report ? toPrivacySensorViews(report) : [];
  const ordered = [...views].sort(
    (a, b) => SENSOR_ORDER.indexOf(a.sensor) - SENSOR_ORDER.indexOf(b.sensor),
  );
  // The header labels the count as "apps com permissão de sensor". Summing the
  // per-sensor totals double-counts any app that appears under more than one
  // sensor (most declare several, e.g. INTERNET), so the number could exceed
  // the number of installed apps. Count DISTINCT package names instead (#840).
  const total = report
    ? new Set(
        report.sensors.flatMap((s) => (s.topApps ?? []).map((a) => a.packageName)),
      ).size
    : 0;

  const toggle = (sensor: string) =>
    setExpanded((prev) => ({ ...prev, [sensor]: !prev[sensor] }));

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Privacy Monitor"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Privacidade
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <GlassSurface style={styles.header}>
            <Text style={[typography.title3, { color: colors.label, fontWeight: '600' }]}>
              Atividade de privacidade
            </Text>
            <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: 4 }]}>
              {loading
                ? 'A carregar…'
                : `${total} ${total === 1 ? 'app' : 'apps'} com permissão de sensor`}
            </Text>
          </GlassSurface>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.systemBlue} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
            {ordered.map((view) => (
              <PrivacySensorCard
                key={view.sensor}
                view={view}
                expanded={!!expanded[view.sensor]}
                onToggle={() => toggle(view.sensor)}
              />
            ))}
            {ordered.length === 0 && (
              <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
                Sem dados de privacidade disponíveis.
              </Text>
            )}
          </View>
        )}

        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Apps instaladas que declaram permissão de acesso a cada sensor, agregadas localmente a partir dos manifestos através da PackageManager (API pública). Não são contagens de utilização real — o Android não expõe o histórico de acessos de apps de terceiros a apps externas.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  card: { marginBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sensorIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  breakdown: {
    marginTop: 12,
  },
  appRow: {
    marginBottom: 12,
  },
  appRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  loading: {
    paddingTop: 48,
    alignItems: 'center',
  },
  footer: {
    marginHorizontal: 32,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
});
