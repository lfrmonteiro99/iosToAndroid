import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { BorderRadius } from '../theme/CupertinoTheme';
import { useReadingList, ReadingListItem } from '../store/ReadingListStore';

export interface BrowserReadingListProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called when the user taps a saved item. The caller (e.g. BrowserScreen)
   * should navigate the browser to `item.url` and then close this modal.
   */
  onOpenItem: (item: ReadingListItem) => void;
}

export function BrowserReadingList({ visible, onClose, onOpenItem }: BrowserReadingListProps) {
  const { theme, typography } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();
  const { items, removeItem, markRead } = useReadingList();

  const readCount = items.filter((it) => it.isRead).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View
            style={[styles.handle, { backgroundColor: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]}
          />

          <View style={[styles.header, { borderColor: colors.separator }]}>
            <Text style={[typography.title3, { color: colors.label }]}>Reading List</Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
              {items.length} {items.length === 1 ? 'item' : 'items'}
              {items.length > 0 ? ` · ${readCount} read` : ''}
            </Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={40} color={colors.tertiaryLabel ?? colors.secondaryLabel} />
              <Text style={[typography.callout, { color: colors.secondaryLabel, marginTop: 8 }]}>
                No saved pages yet
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {items.map((item) => (
                <View
                  key={item.id}
                  style={[styles.row, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                >
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => {
                      onOpenItem(item);
                      onClose();
                    }}
                    accessibilityLabel={item.title || item.url}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={item.isRead ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={item.isRead ? '#34C759' : colors.secondaryLabel}
                      style={styles.rowIcon}
                    />
                    <View style={styles.rowText}>
                      <Text
                        style={[typography.subhead, { color: colors.label }]}
                        numberOfLines={1}
                      >
                        {item.title || item.url}
                      </Text>
                      <Text
                        style={[typography.caption2, { color: colors.secondaryLabel }]}
                        numberOfLines={1}
                      >
                        {item.url}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.rowAction}
                    onPress={() => markRead(item.id, !item.isRead)}
                    accessibilityLabel={item.isRead ? `Mark ${item.title || item.url} as unread` : `Mark ${item.title || item.url} as read`}
                    accessibilityRole="button"
                  >
                    <Text style={[typography.caption1, { color: colors.systemBlue }]}>
                      {item.isRead ? 'Unread' : 'Read'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.rowAction}
                    onPress={() => removeItem(item.id)}
                    accessibilityLabel={`Remove ${item.title || item.url} from reading list`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}
            onPress={onClose}
            accessibilityLabel="Close Reading List"
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 10,
  },
  rowText: {
    flex: 1,
  },
  rowAction: {
    paddingHorizontal: 10,
    justifyContent: 'center',
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
