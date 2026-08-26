/**
 * iOS widget gallery — the sheet you get from long-pressing the home screen and
 * tapping "+".
 *
 * Why this exists: widgets were already implemented and already persisted
 * (`useWidgetConfig` / `WIDGET_CONFIG_KEY`), and the home screen already
 * rendered them at the top of page 0. But the ONLY way to change which ones
 * were on was: swipe right from page 0 into the Today View, scroll to the
 * bottom, find an "Edit" button, and use a list of +/- rows. Nobody finds that,
 * and it is not how iOS works — on iOS you long-press the home screen and tap
 * "+" in the corner, and the gallery shows each widget as a live preview rather
 * than as a row in a list.
 *
 * The gallery writes through the same `setEnabled` the Today View's panel uses,
 * so the two surfaces cannot drift: adding here shows up there and vice versa.
 * Order is preserved as the insertion order, which is what the home row and the
 * Today View grid both read.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAlert } from './AlertProvider';
import { useTheme } from '../theme/ThemeContext';
import {
  ALL_WIDGET_TYPES,
  WIDGET_LABELS,
  DEFAULT_WIDGET_SIZES,
  useWidgetConfig,
  useWidgetMap,
  type WidgetType,
} from '../widgets/TodayWidgets';
import { isOnHomePage } from '../widgets/widgetInstances';
import { resolveWidgetPlacement } from '../widgets/homeGridLayout';

export interface WidgetGalleryProps {
  visible: boolean;
  onClose: () => void;
  /**
   * The home page being viewed when the gallery opened. A widget is placed
   * here (#936) — iOS puts it where you are, no page picker. If this page has
   * no room, the widget overflows to the next page with space and the user is
   * told, rather than being dropped or hidden on a page they are not looking at.
   */
  focusPage: number;
  /** Grid dimensions, so the gallery can tell whether `focusPage` has room. */
  cols: number;
  rows: number;
}

/**
 * One gallery entry: the widget itself, rendered at the size it will appear on
 * the home screen, with the add/remove affordance. Showing the real widget
 * (rather than an icon and a label) is the point of the gallery — it is how you
 * decide whether you want it.
 */
function GalleryEntry({
  type,
  preview,
  placedCount,
  onAdd,
  onRemove,
}: {
  type: WidgetType;
  preview: React.ReactNode;
  /** How many of this type are already placed. Zero is not a special case. */
  placedCount: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { textScale } = useTheme();
  const label = WIDGET_LABELS[type];
  return (
    <View style={styles.entry} testID={`widget-gallery-entry-${type}`}>
      <View style={styles.entryHeader}>
        <Text style={[styles.entryLabel, { fontSize: 17 * textScale }]}>{label}</Text>
        <Text style={[styles.entrySize, { fontSize: 13 * textScale }]}>
          {DEFAULT_WIDGET_SIZES[type] === 'small' ? 'Small' : DEFAULT_WIDGET_SIZES[type] === 'medium' ? 'Medium' : 'Large'}
        </Text>
      </View>

      {/* pointerEvents none: the preview is a picture of the widget, so a tap on
          a live control inside it (the Messages widget opens a thread) must not
          fire from the gallery. */}
      <View style={styles.previewWrap} pointerEvents="none">
        {preview}
      </View>

      {/* Add is ALWAYS offered, and Remove only appears alongside it once
          something is placed. The gallery used to swap one button for the
          other, which made a second copy of a type impossible to ask for —
          two Weather widgets (two cities) is the case the instance model
          (#933) exists to allow. */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={onAdd}
          style={[styles.actionBtn, styles.actionBtnAdd]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label} widget`}
        >
          <Ionicons name="add-circle" size={18} color="#0A84FF" />
          <Text style={[styles.actionText, { color: '#0A84FF', fontSize: 15 * textScale }]}>
            {placedCount > 0 ? `Add Another (${placedCount})` : 'Add Widget'}
          </Text>
        </Pressable>
        {placedCount > 0 && (
          <Pressable
            onPress={onRemove}
            style={[styles.actionBtn, styles.actionBtnRemove]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label} widget`}
          >
            <Ionicons name="remove-circle" size={18} color="#FF453A" />
            <Text style={[styles.actionText, { color: '#FF453A', fontSize: 15 * textScale }]}>
              Remove
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function WidgetGallery({ visible, onClose, focusPage, cols, rows }: WidgetGalleryProps) {
  const insets = useSafeAreaInsets();
  const { textScale } = useTheme();
  const alert = useAlert();
  const { instances, addWidget, removeWidget } = useWidgetConfig();
  const widgetMap = useWidgetMap();
  const [query, setQuery] = useState('');

  /** Placed count per type — what the row shows, and what gates Remove. */
  const placed = useMemo(() => {
    const counts = new Map<WidgetType, number>();
    for (const i of instances) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    return counts;
  }, [instances]);

  /**
   * Place on the page the user is looking at (#936). Where it lands is decided
   * by `resolveWidgetPlacement`, which prefers `focusPage` and walks forward to
   * the first page with room when that one is full — reporting `overflowed` so
   * we can tell the user rather than hiding the widget on a page they cannot
   * see. The chosen page is passed straight to `addWidget`, which persists it.
   */
  const add = useCallback(
    (type: WidgetType) => {
      const homePlaced = instances.filter(isOnHomePage);
      const { page, overflowed } = resolveWidgetPlacement({
        cols,
        rows,
        placed: homePlaced,
        focusPage,
        size: DEFAULT_WIDGET_SIZES[type],
      });
      addWidget(type, { page });
      if (overflowed) {
        alert(
          'Not enough room here',
          `Added to page ${page + 1} — the page you were on was full.`,
        );
      }
    },
    [addWidget, alert, cols, rows, focusPage, instances],
  );

  // Removes the LAST placed instance of the type: with several of a kind, the
  // one the user just added is the one they are most likely undoing.
  const remove = useCallback(
    (type: WidgetType) => {
      const last = [...instances].reverse().find((i) => i.type === type);
      if (last) removeWidget(last.id);
    },
    [instances, removeWidget],
  );

  const visibleTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return ALL_WIDGET_TYPES;
    return ALL_WIDGET_TYPES.filter((t) => WIDGET_LABELS[t].toLowerCase().includes(q));
  }, [query]);

  // Early return, not just `visible={false}` on the Modal: under jest a Modal
  // still renders its children, so the gallery's BlurView stayed in the tree and
  // broke callers that look one up by type (the dock-radius assertion in
  // LauncherHomeScreen.test.tsx found two). Nothing here is worth mounting while
  // the sheet is closed anyway.
  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={[styles.sheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { fontSize: 28 * textScale }]}>Widgets</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close widget gallery"
            >
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { fontSize: 15 * textScale }]}>
            Widgets appear on the home page you add them from.
          </Text>

          {/* Filter is a plain row of chips rather than a text field: with six
              widgets a keyboard costs more than it saves, and it keeps the sheet
              usable one-handed. */}
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setQuery('')}
              style={[styles.chip, query === '' && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel="Show all widgets"
            >
              <Text style={[styles.chipText, { fontSize: 13 * textScale }]}>All</Text>
            </Pressable>
            <Pressable
              onPress={() => setQuery('')}
              style={styles.chipCount}
              accessibilityLabel={`${instances.length} widgets added`}
            >
              <Text style={[styles.chipText, { fontSize: 13 * textScale }]}>
                {instances.length} added
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {visibleTypes.map((type) => (
              <GalleryEntry
                key={type}
                type={type}
                preview={widgetMap[type]}
                placedCount={placed.get(type) ?? 0}
                onAdd={() => add(type)}
                onRemove={() => remove(type)}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  chipCount: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  list: {
    flex: 1,
    marginTop: 14,
  },
  listContent: {
    paddingBottom: 24,
    gap: 18,
  },
  entry: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 14,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  entryLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  entrySize: {
    color: 'rgba(255,255,255,0.5)',
  },
  previewWrap: {
    marginTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  actionBtnAdd: {
    backgroundColor: 'rgba(10,132,255,0.16)',
  },
  actionBtnRemove: {
    backgroundColor: 'rgba(255,69,58,0.16)',
  },
  actionText: {
    fontWeight: '600',
  },
});

export default WidgetGallery;
