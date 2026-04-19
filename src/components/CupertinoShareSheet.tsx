import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CupertinoShareSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  url?: string;
  text?: string;
}

// ─── Share Options ───────────────────────────────────────────────────────────

interface ShareOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
}

const SHARE_OPTIONS: ShareOption[] = [
  { id: 'copy', label: 'Copy', icon: 'copy-outline', iconBg: '#636366' },
  { id: 'messages', label: 'Messages', icon: 'chatbubble-outline', iconBg: '#34C759' },
  { id: 'mail', label: 'Mail', icon: 'mail-outline', iconBg: '#007AFF' },
  { id: 'more', label: 'More', icon: 'ellipsis-horizontal', iconBg: '#8E8E93' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function CupertinoShareSheet({ visible, onClose, title, url, text }: CupertinoShareSheetProps) {
  const { theme, typography } = useTheme();
  const { colors, dark } = theme;
  const insets = useSafeAreaInsets();

  const sharePayload = text || url || title || '';

  const handleOption = async (option: ShareOption) => {
    onClose();
    // Give the modal time to close before launching system sheets
    await new Promise((r) => setTimeout(r, 150));
    switch (option.id) {
      case 'copy':
        await Clipboard.setStringAsync(sharePayload);
        break;
      case 'messages': {
        const smsUrl = `sms:?body=${encodeURIComponent(sharePayload)}`;
        if (await Linking.canOpenURL(smsUrl)) {
          Linking.openURL(smsUrl);
        } else {
          Share.share({ message: sharePayload });
        }
        break;
      }
      case 'mail': {
        const subject = encodeURIComponent(title || 'Shared from iosToAndroid');
        const body = encodeURIComponent(sharePayload);
        const mailUrl = `mailto:?subject=${subject}&body=${body}`;
        if (await Linking.canOpenURL(mailUrl)) {
          Linking.openURL(mailUrl);
        } else {
          Share.share({ message: sharePayload });
        }
        break;
      }
      case 'more':
        Share.share({ message: sharePayload, title: title });
        break;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <BlurView
            intensity={85}
            tint={dark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />

          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }]} />

          {/* Title / URL preview */}
          {(title || url) && (
            <View style={[styles.previewCard, { backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              {title && (
                <Text style={[typography.headline, { color: colors.label }]} numberOfLines={1}>
                  {title}
                </Text>
              )}
              {url && (
                <Text style={[typography.caption1, { color: colors.secondaryLabel }]} numberOfLines={1}>
                  {url}
                </Text>
              )}
            </View>
          )}

          {/* Share option icons (horizontal scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.optionsScroll}
          >
            {SHARE_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={styles.optionItem}
                onPress={() => handleOption(option)}
                accessibilityLabel={option.label}
                accessibilityRole="button"
              >
                <View style={[styles.optionIconWrap, { backgroundColor: option.iconBg }]}>
                  <Ionicons name={option.icon} size={24} color="#fff" />
                </View>
                <Text style={[styles.optionLabel, { color: colors.label }]}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />

          {/* Cancel button */}
          <Pressable
            style={[styles.cancelBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}
            onPress={onClose}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={[typography.headline, { color: colors.systemBlue }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  previewCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
  },
  optionsScroll: {
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 16,
  },
  optionItem: {
    alignItems: 'center',
    width: 68,
  },
  optionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  cancelBtn: {
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
