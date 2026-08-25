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
import { useTheme } from '../theme/ThemeContext';
import {
  ALL_WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_SIZES,
  useWidgetConfig,
  useWidgetMap,
  type WidgetType,
} from '../widgets/TodayWidgets';

export interface WidgetGalleryProps {
  visible: boolean;
  onClose: () => void;
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
  isAdded,
  onAdd,
  onRemove,
}: {
  type: WidgetType;
  preview: React.ReactNode;
  isAdded: boolean;
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
          {WIDGET_SIZES[type] === 'small' ? 'Small' : WIDGET_SIZES[type] === 'medium' ? 'Medium' : 'Large'}
        </Text>
      </View>

      {/* pointerEvents none: the preview is a picture of the widget, so a tap on
          a live control inside it (the Messages widget opens a thread) must not
          fire from the gallery. */}
      <View style={styles.previewWrap} pointerEvents="none">
        {preview}
      </View>

      {isAdded ? (
        <Pressable
          onPress={onRemove}
          style={[styles.actionBtn, styles.actionBtnRemove]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label} widget`}
        >
          <Ionicons name="remove-circle" size={18} color="#FF453A" />
          <Text style={[styles.actionText, { color: '#FF453A', fontSize: 15 * textScale }]}>
            Remove Widget
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onAdd}
          style={[styles.actionBtn, styles.actionBtnAdd]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label} widget`}
        >
          <Ionicons name="add-circle" size={18} color="#0A84FF" />
          <Text style={[styles.actionText, { color: '#0A84FF', fontSize: 15 * textScale }]}>
            Add Widget
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function WidgetGallery({ visible, onClose }: WidgetGalleryProps) {
  const insets = useSafeAreaInsets();
  const { textScale } = useTheme();
  const { enabled, setEnabled } = useWidgetConfig();
  const widgetMap = useWidgetMap();
  const [query, setQuery] = useState('');

  const added = useMemo(() => new Set(enabled), [enabled]);

  const add = useCallback(
    (type: WidgetType) => {
      // Appended, not inserted: the home row and the Today View grid both read
      // this order, and a new widget arriving in the middle would silently
      // reshuffle a layout the user arranged.
      if (!added.has(type)) setEnabled([...enabled, type]);
    },
    [added, enabled, setEnabled],
  );

  const remove = useCallback(
    (type: WidgetType) => setEnabled(enabled.filter((t) => t !== type)),
    [enabled, setEnabled],
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
            Widgets appear at the top of your first home page and in Today View.
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
              accessibilityLabel={`${enabled.length} widgets added`}
            >
              <Text style={[styles.chipText, { fontSize: 13 * textScale }]}>
                {enabled.length} added
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
                isAdded={added.has(type)}
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
  actionBtn: {
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
