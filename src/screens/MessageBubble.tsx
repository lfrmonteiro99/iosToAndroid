import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { DeviceSms } from '../store/DeviceStore';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { Typography } from '../theme/CupertinoTheme';

export interface LocalImageMessage {
  id: string;
  address: string;
  body: string;
  dateFormatted: string;
  type: number;
  isRead: boolean;
  imageUri: string;
}

export function isLocalImageMessage(m: DeviceSms | LocalImageMessage): m is LocalImageMessage {
  return typeof (m as LocalImageMessage).imageUri === 'string';
}

export const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const SCREEN_WIDTH = Dimensions.get('window').width;
const BUBBLE_MAX_WIDTH = SCREEN_WIDTH * 0.75;

export interface BubbleProps {
  message: DeviceSms | LocalImageMessage;
  isDark: boolean;
  colors: CupertinoColors;
  typography: typeof Typography;
  reactions?: string[];
  onLongPress?: () => void;
  showReactionPicker?: boolean;
  onReaction?: (emoji: string) => void;
  onCopy?: () => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isDark,
  colors,
  typography,
  reactions,
  onLongPress,
  showReactionPicker,
  onReaction,
  onCopy,
}: BubbleProps) {
  const isSent = message.type === 2;
  const pickerScale = useSharedValue(showReactionPicker ? 1 : 0);

  useEffect(() => {
    pickerScale.value = withSpring(showReactionPicker ? 1 : 0, { damping: 18, stiffness: 400 });
  }, [showReactionPicker, pickerScale]);

  const pickerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pickerScale.value }],
    opacity: pickerScale.value,
  }));

  const bubbleBackground = isSent
    ? colors.systemGreen
    : isDark
    ? '#38383A'
    : colors.systemGray5;

  const textColor = isSent ? '#FFFFFF' : colors.label;

  return (
    <View
      style={[
        styles.bubbleRow,
        isSent ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      {showReactionPicker && (
        <Animated.View style={[styles.reactionPicker, isSent ? styles.reactionPickerRight : styles.reactionPickerLeft, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }, pickerStyle]}>
          <View style={styles.reactionEmojiRow}>
            {REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onReaction?.(emoji)}
                style={({ pressed }) => [styles.reactionBtn, pressed && { transform: [{ scale: 1.3 }] }]}
                accessibilityLabel={`React with ${emoji}`}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.reactionActionDivider, { backgroundColor: isDark ? '#48484A' : '#E5E5EA' }]} />
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.reactionActionBtn, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel="Copy message"
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={16} color={isDark ? '#EBEBF5' : '#3C3C43'} />
            <Text style={[typography.subhead, { color: isDark ? '#EBEBF5' : '#3C3C43', marginLeft: 6 }]}>
              Copy
            </Text>
          </Pressable>
        </Animated.View>
      )}
      <Pressable onLongPress={onLongPress} delayLongPress={400} accessibilityLabel="Message" accessibilityHint="Long press for options" accessibilityRole="button">
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isLocalImageMessage(message) ? 'transparent' : bubbleBackground,
              maxWidth: BUBBLE_MAX_WIDTH,
              elevation: isSent ? 1 : 0,
            },
            isSent ? styles.bubbleSent : styles.bubbleReceived,
          ]}
        >
          {isLocalImageMessage(message) ? (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.imageBubble}
              resizeMode="cover"
            />
          ) : (
            <Text style={[typography.callout, { color: textColor }]}>
              {message.body}
            </Text>
          )}
          {reactions && reactions.length > 0 && (
            <View style={[styles.reactionBadge, { backgroundColor: isDark ? '#3A3A3C' : '#E8E8ED', borderColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              {reactions.map((r, i) => (
                <Text key={i} style={{ fontSize: 12 }}>{r}</Text>
              ))}
            </View>
          )}
          {isSent ? (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: -6,
                width: 0,
                height: 0,
                borderLeftWidth: 8,
                borderLeftColor: colors.systemGreen,
                borderTopWidth: 8,
                borderTopColor: 'transparent',
                borderBottomWidth: 0,
              }}
            />
          ) : (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: -6,
                width: 0,
                height: 0,
                borderRightWidth: 8,
                borderRightColor: bubbleBackground,
                borderTopWidth: 8,
                borderTopColor: 'transparent',
              }}
            />
          )}
        </View>
      </Pressable>
      <View style={[styles.bubbleMeta, isSent ? styles.bubbleMetaRight : styles.bubbleMetaLeft]}>
        <Text
          style={[
            typography.caption2,
            styles.bubbleTime,
            { color: colors.secondaryLabel },
          ]}
        >
          {message.dateFormatted}
        </Text>
        {isSent && (
          <View style={styles.sentIndicator}>
            <Ionicons name="checkmark" size={12} color={colors.secondaryLabel} />
            <Text style={[typography.caption2, { color: colors.secondaryLabel, marginLeft: 2 }]}>
              Sent
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bubbleRow: {
    marginVertical: 2,
  },
  bubbleRowLeft: {
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bubbleSent: {
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    borderBottomLeftRadius: 4,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginHorizontal: 4,
    gap: 6,
  },
  bubbleMetaLeft: {
    justifyContent: 'flex-start',
  },
  bubbleMetaRight: {
    justifyContent: 'flex-end',
  },
  bubbleTime: {
  },
  sentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageBubble: {
    width: 200,
    height: 150,
    borderRadius: 14,
  },
  reactionPicker: {
    flexDirection: 'column',
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    minWidth: 200,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  reactionActionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  reactionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reactionPickerLeft: {
    alignSelf: 'flex-start',
  },
  reactionPickerRight: {
    alignSelf: 'flex-end',
  },
  reactionBtn: {
    padding: 4,
  },
  reactionBadge: {
    position: 'absolute',
    top: -8,
    right: -4,
    flexDirection: 'row',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 2,
    gap: 1,
  },
});
