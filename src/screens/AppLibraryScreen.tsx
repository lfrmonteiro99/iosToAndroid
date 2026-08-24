import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useDevice } from '../store/DeviceStore';
import {
  buildCategorySections,
  recategorizeApp,
  STABLE_KEY_TO_NAME,
} from '../utils/categoryOverrides';
import { CupertinoSearchBar } from '../components/CupertinoSearchBar';
import { CupertinoPressable } from '../components/CupertinoPressable';
import { CupertinoNavigationBar, CupertinoEmptyState } from '../components';
import type { AppNavigationProp } from '../navigation/types';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { hapticImpact } from '../utils/haptics';

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: { name: string; keywords: string[] }[] = [
  {
    name: 'Social',
    keywords: ['facebook', 'instagram', 'twitter', 'whatsapp', 'telegram', 'messenger', 'tiktok', 'snapchat', 'linkedin', 'reddit', 'discord'],
  },
  {
    name: 'Entertainment',
    keywords: ['youtube', 'netflix', 'spotify', 'disney', 'twitch', 'prime', 'hbo', 'hulu', 'music', 'podcast', 'radio', 'player'],
  },
  {
    name: 'Games',
    keywords: ['game', 'gaming', 'games', 'roblox', 'minecraft', 'fortnite', 'pubg', 'candy crush'],
  },
  {
    name: 'Productivity & Finance',
    keywords: ['gmail', 'drive', 'docs', 'sheets', 'calendar', 'slack', 'teams', 'office', 'word', 'excel', 'outlook', 'notion', 'trello', 'asana', 'zoom', 'meet', 'bank', 'banking', 'finance', 'wallet', 'paypal', 'venmo', 'crypto', 'invest', 'budget', 'tax'],
  },
  {
    name: 'Utilities',
    keywords: ['calculator', 'clock', 'camera', 'files', 'settings', 'weather', 'compass', 'flashlight', 'scanner', 'notes', 'reminder', 'translate', 'browser', 'chrome', 'firefox'],
  },
  {
    name: 'Shopping & Food',
    keywords: ['amazon', 'ebay', 'aliexpress', 'wish', 'shop', 'store', 'market', 'etsy', 'shein', 'zalando', 'food', 'restaurant', 'delivery', 'recipe', 'grocery', 'ubereats', 'doordash', 'foodpanda', 'wolt', 'glovo'],
  },
  {
    name: 'Creativity',
    keywords: ['photoshop', 'lightroom', 'canva', 'illustrator', 'procreate', 'sketch', 'draw', 'paint', 'capcut', 'premiere', 'figma'],
  },
  {
    name: 'Information & Reading',
    keywords: ['news', 'reader', 'kindle', 'book', 'magazine', 'rss', 'medium', 'wikipedia', 'flipboard'],
  },
  {
    name: 'Travel',
    keywords: ['uber', 'lyft', 'booking', 'airbnb', 'flight', 'trip', 'travel', 'transit', 'taxi', 'expedia', 'hotel', 'maps'],
  },
  {
    name: 'Health & Fitness',
    keywords: ['fitness', 'health', 'workout', 'gym', 'strava', 'fitbit', 'yoga', 'sleep', 'step', 'calorie', 'diet'],
  },
  {
    name: 'Education',
    keywords: ['education', 'learn', 'course', 'duolingo', 'khan', 'school', 'university', 'study', 'quiz', 'flashcard'],
  },
];

// ApplicationInfo.category (exposed as InstalledApp.category by LauncherModule,
// see modules/launcher-module/src/index.ts) mapped to our category names.
// Not 1:1 — decisions documented in the PR body:
//   - AUDIO and VIDEO both collapse into Entertainment (no separate Music bucket).
//   - IMAGE maps to Creativity (image editors/viewers read closer to creative
//     tools than to any other iOS bucket).
//   - ACCESSIBILITY maps to Utilities (assistive tools are utility-like; iOS's
//     14 categories have no dedicated accessibility bucket).
//   - Health & Fitness and Education have no native ApplicationInfo constant —
//     they're only reachable via keywords below.
const NATIVE_CATEGORY_MAP: Record<string, string> = {
  game: 'Games',
  social: 'Social',
  news: 'Information & Reading',
  maps: 'Travel',
  productivity: 'Productivity & Finance',
  audio: 'Entertainment',
  video: 'Entertainment',
  image: 'Creativity',
  accessibility: 'Utilities',
};

export function categorizeApp(app: InstalledApp): string {
  const native = app.category;
  if (native && native !== 'undefined' && NATIVE_CATEGORY_MAP[native]) {
    return NATIVE_CATEGORY_MAP[native];
  }
  const nameLower = app.name.toLowerCase();
  // packageName pode ser undefined (apps virtuais sem packageName real) — não
  // deixar que isso rebente a cascata; trata-se como string vazia.
  const pkgLower = (app.packageName ?? '').toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    for (const kw of cat.keywords) {
      if (nameLower.includes(kw) || pkgLower.includes(kw)) {
        return cat.name;
      }
    }
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// App Icon component
// ---------------------------------------------------------------------------

const ICON_SIZE = 50;
const ICON_RADIUS = 12;

const AppIcon = React.memo(function AppIcon({
  app,
  size = ICON_SIZE,
  badge,
}: {
  app: InstalledApp;
  size?: number;
  /** Contagem de notificações não lidas a mostrar como dot vermelho (gateado por settings). */
  badge?: number;
}) {
  const radius = (size / ICON_SIZE) * ICON_RADIUS;
  const icon = app.icon ? (
    <Image
      source={{ uri: app.icon }}
      style={{ width: size, height: size, borderRadius: radius }}
      resizeMode="cover"
    />
  ) : (
    (() => {
      // Fallback letter icon
      const letter = app.name.charAt(0).toUpperCase();
      const hue = app.name.charCodeAt(0) % 360;
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: `hsl(${hue}, 55%, 55%)`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '600' }}>
            {letter}
          </Text>
        </View>
      );
    })()
  );
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {icon}
      {badge != null && badge > 0 && (
        <View testID={`app-badge-${app.packageName}`} style={styles.appIconBadge}>
          <Text style={styles.appIconBadgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Category Card
// ---------------------------------------------------------------------------

interface CategoryCardProps {
  title: string;
  apps: InstalledApp[];
  onPress: () => void;
  onLaunchApp: (packageName: string) => void;
  cardWidth: number;
  /** Contagem de notificações não lidas por packageName (passada ao AppIcon). */
  badgeCounts: Record<string, number>;
  /** Se os badges devem ser exibidos (gateado por settings). */
  showNotifications: boolean;
}

// From this many apps onward, the 4th grid cell becomes a 2x2 "more apps"
// quadrant instead of a 4th large icon. Below this, 3 large icons + a
// quadrant holding a single mini icon reads worse than just 4 equal large
// icons — there's nothing extra to signal, so the quadrant only appears once
// there truly is more content hiding behind it.
const QUADRANT_MIN_APPS = 5;
const MAX_QUADRANT_MINIS = 4;
const MINI_GAP = 3;
const MIN_TOUCH_TARGET = 44;

// Pads small icon cells up to the platform's minimum touch target (§1.5)
// without inflating their visual size.
function touchHitSlop(size: number) {
  const pad = Math.ceil(Math.max(0, MIN_TOUCH_TARGET - size) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}

export const CategoryCard = React.memo(function CategoryCard({ title, apps, onPress, onLaunchApp, cardWidth, badgeCounts, showNotifications }: CategoryCardProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const iconSize = (cardWidth - 24 - 6) / 2; // 2 columns with gap inside padding
  const iconHitSlop = touchHitSlop(iconSize);
  const miniSize = (iconSize - MINI_GAP) / 2;

  const hasQuadrant = apps.length >= QUADRANT_MIN_APPS;
  const largeApps = hasQuadrant ? apps.slice(0, 3) : apps.slice(0, 4);
  const miniApps = hasQuadrant ? apps.slice(3, 3 + MAX_QUADRANT_MINIS) : [];

  // DEVIATION from the scale+dim primitive: the category card keeps the
  // pressed-background convention (§3.2 convention 4), now using the shared
  // token. Two reasons — a large tile that shrinks reads wrong next to the
  // launcher grid, and the App Library is mounted inside the launcher pager,
  // where an animated style per card would make a page transition's
  // useAnimatedStyle cost grow with the number of categories (the exact
  // invariant #518 protects). The ad hoc 0.8 opacity is gone either way.
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryCard,
        {
          width: cardWidth,
          backgroundColor: pressed ? colors.pressedRowBackground : colors.secondarySystemGroupedBackground,
        },
      ]}
      accessibilityLabel={`${title} category, ${apps.length} app${apps.length !== 1 ? 's' : ''}`}
      accessibilityRole="button"
    >
      {/* 3 large icons (each opens its app directly) plus, once there are
          more apps than fit, a mini-icon quadrant that opens the category */}
      <View style={styles.iconGrid}>
        {largeApps.map((a) => (
          <Pressable
            key={a.packageName}
            onPress={() => onLaunchApp(a.packageName)}
            hitSlop={iconHitSlop}
            style={{ width: iconSize, height: iconSize }}
            accessibilityLabel={`Open ${a.name}, App Library`}
            accessibilityRole="button"
          >
            <AppIcon app={a} size={iconSize} badge={showNotifications ? badgeCounts[a.packageName] : undefined} />
          </Pressable>
        ))}
        {hasQuadrant && (
          <Pressable
            onPress={onPress}
            hitSlop={iconHitSlop}
            style={[styles.miniQuadrant, { width: iconSize, height: iconSize }]}
            accessibilityLabel={`See all ${apps.length} apps in ${title}`}
            accessibilityRole="button"
          >
            {miniApps.map((a) => (
              <View key={a.packageName} style={{ width: miniSize, height: miniSize }}>
                <AppIcon app={a} size={miniSize} badge={showNotifications ? badgeCounts[a.packageName] : undefined} />
              </View>
            ))}
          </Pressable>
        )}
      </View>
      <Text
        style={[typography.subhead, styles.categoryTitle, { color: colors.label }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[typography.caption1, styles.categoryCount, { color: colors.secondaryLabel }]}>
        {apps.length} app{apps.length !== 1 ? 's' : ''}
      </Text>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Category Detail Modal
// ---------------------------------------------------------------------------

interface CategoryDetailProps {
  visible: boolean;
  title: string;
  /** Chave estável da categoria atual (para recategorizar com base nela). */
  categoryKey: string;
  apps: InstalledApp[];
  onClose: () => void;
  onLaunch: (pkg: string) => void;
  onRequestRecategorize: (packageName: string, currentKey: string) => void;
  /** Contagem de notificações não lidas por packageName (passada ao AppIcon). */
  badgeCounts: Record<string, number>;
  /** Se os badges devem ser exibidos (gateado por settings). */
  showNotifications: boolean;
}

function CategoryDetailModal({ visible, title, categoryKey, apps, onClose, onLaunch, onRequestRecategorize, badgeCounts, showNotifications }: CategoryDetailProps) {
  const { theme, isDark, typography, textScale } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numCols = 4;
  const cellW = width / numCols;
  const iconSize = cellW * 0.58;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: colors.systemGroupedBackground }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {/* Header */}
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.separator }]}>
          <Text style={[styles.modalTitle, { color: colors.label, fontSize: 18 * textScale }]}>{title}</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} accessibilityLabel="Close">
            <Ionicons name="close-circle" size={28} color={colors.systemGray2} />
          </Pressable>
        </View>
        {/* Grid */}
        <FlatList
          data={apps}
          numColumns={numCols}
          keyExtractor={(item) => item.packageName}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onLaunch(item.packageName); onClose(); }}
              onLongPress={() => onRequestRecategorize(item.packageName, categoryKey)}
              delayLongPress={350}
              style={[styles.modalAppCell, { width: cellW }]}
              accessibilityLabel={`Open ${item.name}, App Library`}
              accessibilityRole="button"
            >
              <AppIcon app={item} size={iconSize} badge={showNotifications ? badgeCounts[item.packageName] : undefined} />
              <Text style={[typography.caption2, styles.modalAppLabel, { color: colors.label }]} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Recategorize sheet (long-press num ícone dentro do modal de categoria)
// ---------------------------------------------------------------------------
// Onde se recategoriza uma app (#516): um long-press no ícone dentro do modal
// de detalhe da categoria abre este sheet. Decisão justificada no PR — não é um
// ecrã de definições com 200 apps; é contextual, no sítio onde o utilizador já
// vê a app, e reaproveita o modal que já lista as apps da categoria.

interface RecategorizeSheetProps {
  visible: boolean;
  currentKey: string;
  onCancel: () => void;
  onSelect: (targetKey: string) => void;
  /** #606: esconder a app (App Library only). Fica no mesmo sheet do long-press
   * porque é a mesma acção contextual do iOS ("long-press → Hide App"). */
  onHide: () => void;
}

function RecategorizeSheet({ visible, currentKey, onCancel, onSelect, onHide }: RecategorizeSheetProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  // Todas as categorias conhecidas, pela ordem canónica do mapa.
  const allKeys = Object.keys(STABLE_KEY_TO_NAME);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBackdrop} onPress={onCancel}>
        <View style={[styles.sheetRoot, { backgroundColor: colors.secondarySystemGroupedBackground, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[typography.title3, styles.sheetTitle, { color: colors.label }]}>
            Mover para a categoria
          </Text>
          <FlatList
            data={allKeys}
            keyExtractor={(k) => k}
            renderItem={({ item: key }) => (
              <Pressable
                onPress={() => onSelect(key)}
                style={[styles.sheetRow, { borderBottomColor: colors.separator }]}
                accessibilityLabel={`Mover para ${STABLE_KEY_TO_NAME[key]}`}
                accessibilityRole="button"
              >
                <Text style={[typography.body, { color: colors.label }]}>{STABLE_KEY_TO_NAME[key]}</Text>
                {key === currentKey && (
                  <Ionicons name="checkmark" size={20} color={colors.systemBlue} />
                )}
              </Pressable>
            )}
          />
          <Pressable
            onPress={onHide}
            style={[styles.sheetRow, { borderBottomColor: colors.separator }]}
            accessibilityLabel="Hide App"
            accessibilityRole="button"
          >
            <Text style={[typography.body, { color: colors.systemBlue }]}>Hide App</Text>
            <Ionicons name="eye-off-outline" size={20} color={colors.systemBlue} />
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={[styles.sheetCancel, { borderTopColor: colors.separator }]}
            accessibilityLabel="Cancelar"
            accessibilityRole="button"
          >
            <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>Cancelar</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}


const AppStrip = React.memo(function AppStrip({
  apps,
  onLaunch,
  badgeCounts,
  showNotifications,
}: {
  apps: InstalledApp[];
  onLaunch: (pkg: string) => void;
  badgeCounts: Record<string, number>;
  showNotifications: boolean;
}) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  // iOS App Library: ícones de faixa horizontal alinhados aos ~60px da grelha
  // densa (4 por linha). 62px exagerava e forçava scroll horizontal (#678).
  const stripIconSize = 60;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
      {apps.map((app) => (
        <Pressable
          key={app.packageName}
          onPress={() => onLaunch(app.packageName)}
          style={styles.stripItem}
          accessibilityLabel={`Open ${app.name}, App Library`}
          accessibilityRole="button"
        >
          <AppIcon
            app={app}
            size={stripIconSize}
            badge={showNotifications ? badgeCounts[app.packageName] : undefined}
          />
          <Text style={[typography.caption2, styles.stripLabel, { color: colors.label }]} numberOfLines={2}>
            {app.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
});

// ---------------------------------------------------------------------------
// Search results list
// ---------------------------------------------------------------------------

const SearchResults = React.memo(function SearchResults({
  apps,
  onLaunch,
  badgeCounts,
  showNotifications,
}: {
  apps: InstalledApp[];
  onLaunch: (pkg: string) => void;
  badgeCounts: Record<string, number>;
  showNotifications: boolean;
}) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      data={apps}
      keyExtractor={(item) => item.packageName}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 66 }} />
      )}
      ListEmptyComponent={
        <CupertinoEmptyState
          icon="search-outline"
          title="No Results"
          message="No apps match your search."
        />
      }
      renderItem={({ item }) => (
        <CupertinoPressable
          onPress={() => onLaunch(item.packageName)}
          style={styles.searchRow}
          accessibilityLabel={`Open ${item.name}, App Library`}
          accessibilityRole="button"
        >
          <AppIcon app={item} size={46} badge={showNotifications ? badgeCounts[item.packageName] : undefined} />
          <Text style={[typography.callout, styles.searchRowLabel, { color: colors.label }]}>{item.name}</Text>
        </CupertinoPressable>
      )}
    />
  );
});

// ---------------------------------------------------------------------------
// Section Header helper
// ---------------------------------------------------------------------------

function SectionHeader({ title, colors }: { title: string; colors: CupertinoColors }) {
  const { typography } = useTheme();
  return (
    <Text style={[typography.title3, styles.sectionHeader, { color: colors.label }]}>{title}</Text>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

// Shared body of the App Library: search bar, Recently Added / Suggestions
// strips, category grid and the category detail modal. Rendered both by the
// `AppLibrary` stack route (AppLibraryScreen, below) and directly as the last
// page of the paginated home screen (LauncherHomeScreen) — see issue #434.
// Keeping this in one place means the two call sites can't drift apart the
// way twin overlays did in #384.
export function AppLibraryContent() {
  const { theme } = useTheme();
  const { colors } = theme;
  // `apps` é a lista completa (usada só pela procura, para que uma app
  // escondida continue lançável) e `visibleApps` é a lista sem as escondidas
  // (#606), usada nas categorias e nos strips.
  const { apps: allInstalledApps, visibleApps: nonHiddenApps, launchApp, recentApps, hideApp } = useApps();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const [categoryModal, setCategoryModal] = useState<{ title: string; key: string; apps: InstalledApp[] } | null>(null);
  // Estado do long-press "recategorizar app": qual app e se o sheet está visível.
  const [recatSheet, setRecatSheet] = useState<{ packageName: string; currentKey: string } | null>(null);
  // Card layout — 2 columns with gap
  const CARD_GAP = 12;
  const SIDE_PAD = 16;
  const cardWidth = (width - SIDE_PAD * 2 - CARD_GAP) / 2;

  // Categorias da grelha, com overrides do utilizador aplicados
  // (ocultar / renomear / reordenar / appOverrides). Usa chaves estáveis, por
  // isso renomear não parte a atribuição.
  const { settings, update } = useSettings();
  const device = useDevice();
  // Siri & Search → «Show Apps in App Library» (#610). Quando desligado a App
  // Library não mostra nenhuma app: nem strips, nem categorias, nem resultados
  // da sua própria procura. As apps continuam instaladas e lançáveis a partir
  // da home. Filtra-se aqui, à entrada, para que os dois consumidores da lista
  // (browse e procura) não possam divergir.
  const visibleApps = useMemo(
    () => (settings.searchShowInLibrary ? nonHiddenApps : []),
    [nonHiddenApps, settings.searchShowInLibrary],
  );
  const apps = useMemo(
    () => (settings.searchShowInLibrary ? allInstalledApps : []),
    [allInstalledApps, settings.searchShowInLibrary],
  );
  const categories = useMemo(() => {
    return buildCategorySections(visibleApps, settings.categoryOverrides, categorizeApp);
  }, [visibleApps, settings.categoryOverrides]);

  // Badge counts — mesma fonte da home (LauncherHomeScreen.tsx:1113): SMS não
  // lidas do device mapeiam para a app Messages. Gateado por
  // appLibraryShowNotifications: só contam quando o toggle está ligado.
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const unread = device.messages.filter((m) => !m.isRead).length;
    if (unread > 0) counts['com.iostoandroid.messages'] = unread;
    return counts;
  }, [device.messages]);

  // Toggles da App Library (#602).
  const showSuggestions = settings.appLibraryShowSuggestions;
  const showNotifications = settings.appLibraryShowNotifications;

  // Grava um appOverrides (recategorização via long-press).
  const handleRecategorize = useCallback((packageName: string, targetKey: string) => {
    const next = recategorizeApp(settings.categoryOverrides, packageName, targetKey);
    update('categoryOverrides', next);
    setRecatSheet(null);
  }, [settings.categoryOverrides, update]);

  // Recently Added — most recently launched apps (by launchedAt timestamp)
  const recentlyAddedApps = useMemo(() => {
    const recentPkgs = [...recentApps]
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(0, 4)
      .map(r => visibleApps.find(a => a.packageName === r.packageName))
      .filter((a): a is InstalledApp => !!a);
    if (recentPkgs.length > 0) return recentPkgs;
    // Fallback: newest-named apps when no launch history exists
    return [...visibleApps].sort((a, b) => b.name.localeCompare(b.name)).slice(0, 4);
  }, [visibleApps, recentApps]);

  // Suggestions — next 4 most-recently-launched apps after Recently Added
  const suggestedApps = useMemo(() => {
    // Siri & Search → «Show Suggestions» (#610): sem sugestões, sem strip.
    if (!settings.searchShowSuggestions) return [];
    const recentSorted = [...recentApps]
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(4, 8)
      .map(r => visibleApps.find(a => a.packageName === r.packageName))
      .filter((a): a is InstalledApp => !!a);
    if (recentSorted.length > 0) return recentSorted;
    return [...visibleApps].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 4);
  }, [visibleApps, recentApps, settings.searchShowSuggestions]);

  // Filtered apps for search
  const filteredApps = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => a.name.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apps, query]);

  const handleLaunch = useCallback((packageName: string) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    launchApp(packageName);
  }, [launchApp]);

  const isSearching = query.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.systemGroupedBackground }]}>
      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <CupertinoSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="App Library"
          autoFocus={false}
        />
      </View>

      {isSearching ? (
        /* Search results */
        <SearchResults
          apps={filteredApps}
          onLaunch={handleLaunch}
          badgeCounts={badgeCounts}
          showNotifications={showNotifications}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Recently Added — faixa de sugestões do iOS, oculta quando
              appLibraryShowSuggestions está desligado. */}
          {showSuggestions && recentlyAddedApps.length > 0 && (
            <View style={styles.stripSection}>
              <SectionHeader title="Recently Added" colors={colors} />
              <View style={[styles.stripCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
                <AppStrip
                  apps={recentlyAddedApps}
                  onLaunch={handleLaunch}
                  badgeCounts={badgeCounts}
                  showNotifications={showNotifications}
                />
              </View>
            </View>
          )}

          {/* Suggestions — mesma faixa de sugestões do iOS. */}
          {showSuggestions && suggestedApps.length > 0 && (
            <View style={styles.stripSection}>
              <SectionHeader title="Suggestions" colors={colors} />
              <View style={[styles.stripCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
                <AppStrip
                  apps={suggestedApps}
                  onLaunch={handleLaunch}
                  badgeCounts={badgeCounts}
                  showNotifications={showNotifications}
                />
              </View>
            </View>
          )}

          {/* Category grid */}
          <SectionHeader title="Categories" colors={colors} />
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <CategoryCard
                key={cat.key}
                title={cat.displayName}
                apps={cat.apps}
                cardWidth={cardWidth}
                onPress={() => setCategoryModal({ title: cat.displayName, key: cat.key, apps: cat.apps })}
                onLaunchApp={handleLaunch}
                badgeCounts={badgeCounts}
                showNotifications={showNotifications}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Category Detail Modal */}
      {categoryModal && (
        <CategoryDetailModal
          visible
          title={categoryModal.title}
          categoryKey={categoryModal.key}
          apps={categoryModal.apps}
          onClose={() => setCategoryModal(null)}
          onLaunch={handleLaunch}
          onRequestRecategorize={(pkg, currentKey) => setRecatSheet({ packageName: pkg, currentKey })}
          badgeCounts={badgeCounts}
          showNotifications={showNotifications}
        />
      )}

      {/* Recategorize sheet (long-press dentro do modal de categoria) */}
      <RecategorizeSheet
        visible={recatSheet !== null}
        currentKey={recatSheet?.currentKey ?? ''}
        onCancel={() => setRecatSheet(null)}
        onSelect={(targetKey) => {
          if (recatSheet) handleRecategorize(recatSheet.packageName, targetKey);
        }}
        onHide={() => {
          if (recatSheet) hideApp(recatSheet.packageName);
          setRecatSheet(null);
          setCategoryModal(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stack route wrapper — nav bar + back button, then the shared content
// ---------------------------------------------------------------------------

export function AppLibraryScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, isDark, typography } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <CupertinoNavigationBar
        title="App Library"
        largeTitle={false}
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.body, styles.backLabel, { color: colors.systemBlue }]}>Back</Text>
          </Pressable>
        }
        rightButton={
          <Pressable
            onPress={() => navigation.navigate('AppStore')}
            style={styles.storeBtn}
            accessibilityRole="button"
            accessibilityLabel="App Store"
          >
            <Ionicons name="bag-outline" size={22} color={colors.systemBlue} />
          </Pressable>
        }
      />
      <AppLibraryContent />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screenRoot: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 4,
  },
  backLabel: {
    fontWeight: '400',
  },
  storeBtn: {
    minWidth: 70,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  searchBarWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 10,
    marginTop: 8,
  },

  // Strip section (Recently Added / Suggestions)
  stripSection: {
    marginBottom: 16,
  },
  stripCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  stripContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 18,
  },
  stripItem: {
    alignItems: 'center',
    width: 72,
  },
  stripLabel: {
    fontWeight: '400',
    marginTop: 5,
    textAlign: 'center',
  },

  // Category grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  categoryCard: {
    borderRadius: 20,
    padding: 12,
    overflow: 'hidden',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: 10,
  },
  miniQuadrant: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    gap: MINI_GAP,
  },
  categoryTitle: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  categoryCount: {
    fontWeight: '400',
    marginTop: 2,
  },

  // Search results
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  searchRowLabel: {
    fontWeight: '400',
  },

  // Modal
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 16,
    bottom: 10,
  },
  modalAppCell: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  modalAppLabel: {
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 5,
  },

  // App Icon badge (dot de notificações não lidas) — #602
  appIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  appIconBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Recategorize sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetRoot: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCancel: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
});
