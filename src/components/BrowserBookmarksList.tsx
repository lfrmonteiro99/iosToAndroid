import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { BorderRadius } from '../theme/CupertinoTheme';
import type { Bookmark } from '../store/BookmarksStore';

export interface BrowserBookmarksListProps {
  visible: boolean;
  onClose: () => void;
  /** Saved bookmarks to render (newest first). */
  bookmarks: Bookmark[];
  /**
   * Called when the user taps a saved bookmark. The caller (e.g. BrowserScreen)
   * should navigate the active browser tab to `url` and then close this modal.
   */
  onNavigate: (url: string) => void;
}

export function BrowserBookmarksList({
  visible,
  onClose,
  bookmarks,
  onNavigate,
}: BrowserBookmarksListProps) {
  const { theme, typography } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View
            style={[styles.handle, { backgroundColor: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]}
          />

          <View style={[styles.header, { borderColor: colors.separator }]}>
            <Text style={[typography.title3, { color: colors.label }]}>Bookmarks</Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
              {bookmarks.length} {bookmarks.length === 1 ? 'item' : 'items'}
            </Text>
          </View>

          {bookmarks.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={40} color={colors.tertiaryLabel ?? colors.secondaryLabel} />
              <Text style={[typography.callout, { color: colors.secondaryLabel, marginTop: 8 }]}>
                No bookmarks yet
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {bookmarks.map((bm) => (
                <Pressable
                  key={bm.id}
                  style={[styles.row, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  onPress={() => {
                    onNavigate(bm.url);
                    onClose();
                  }}
                  accessibilityLabel={bm.title || bm.url}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="bookmark"
                    size={20}
                    color="#FF9500"
                    style={styles.rowIcon}
                  />
                  <View style={styles.rowText}>
                    <Text
                      style={[typography.subhead, { color: colors.label }]}
                      numberOfLines={1}
                    >
                      {bm.title || bm.url}
                    </Text>
                    <Text
                      style={[typography.caption2, { color: colors.secondaryLabel }]}
                      numberOfLines={1}
                    >
                      {bm.url}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}
            onPress={onClose}
            accessibilityLabel="Close Bookmarks"
            accessibilityRole="button"
          >
            <Text style={[typography.headline, { color: colors.systemBlue }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingTop: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.medium,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowIcon: {
    marginRight: 10,
  },
  rowText: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  cancelBtn: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: BorderRadius.medium,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
