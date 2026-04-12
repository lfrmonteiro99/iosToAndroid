import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSwipeableRow,
  useAlert,
} from '../components';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Email {
  id: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  isRead: boolean;
  isFlagged: boolean;
}

// ─── Demo Data ──────────────────────────────────────────────────────────────

const DEMO_EMAILS: Email[] = [
  { id: '1', from: 'Tim Cook', fromEmail: 'tim@apple.com', to: 'me@icloud.com', subject: 'Welcome to the Team', body: 'We are thrilled to have you join us. Your first day will be an exciting one with orientation, team introductions, and a tour of the campus. Please arrive by 9 AM at the main lobby.\n\nLooking forward to working with you!', date: 'Today', isRead: false, isFlagged: false },
  { id: '2', from: 'App Store Connect', fromEmail: 'no-reply@apple.com', to: 'me@icloud.com', subject: 'Your app has been approved', body: 'Congratulations! Your app "iosToAndroid" has been reviewed and approved for the App Store. It will be available for download within 24 hours.\n\nThank you for your submission.', date: 'Today', isRead: false, isFlagged: true },
  { id: '3', from: 'GitHub', fromEmail: 'notifications@github.com', to: 'me@icloud.com', subject: 'New pull request: feat/camera-fix', body: 'A new pull request has been opened on your repository iosToAndroid.\n\nTitle: feat: fix camera screen with expo-camera\nAuthor: developer\nFiles changed: 3\n\nPlease review at your earliest convenience.', date: 'Yesterday', isRead: true, isFlagged: false },
  { id: '4', from: 'Jane Smith', fromEmail: 'jane@example.com', to: 'me@icloud.com', subject: 'Lunch tomorrow?', body: 'Hey! Are you free for lunch tomorrow? I was thinking we could try that new place downtown. Let me know!\n\nBest,\nJane', date: 'Yesterday', isRead: true, isFlagged: false },
  { id: '5', from: 'Netflix', fromEmail: 'info@netflix.com', to: 'me@icloud.com', subject: 'New arrivals this week', body: 'Check out what\'s new on Netflix this week:\n\n• The latest season of your favorite show\n• A critically acclaimed documentary\n• New comedy specials\n\nStart watching now!', date: 'Mon', isRead: true, isFlagged: false },
  { id: '6', from: 'John Doe', fromEmail: 'john@company.com', to: 'me@icloud.com', subject: 'Project update - Q4 goals', body: 'Hi team,\n\nHere\'s our progress update for Q4:\n\n1. Feature development: 85% complete\n2. Bug fixes: On track\n3. Performance improvements: Testing phase\n\nLet\'s discuss in our standup tomorrow.', date: 'Mon', isRead: true, isFlagged: false },
  { id: '7', from: 'Apple', fromEmail: 'noreply@apple.com', to: 'me@icloud.com', subject: 'Your receipt from Apple', body: 'Thank you for your purchase.\n\nItem: iCloud+ 200GB\nPrice: $2.99/month\nDate: April 10, 2026\n\nThis charge will appear on your next billing statement.', date: 'Sun', isRead: true, isFlagged: false },
  { id: '8', from: 'Security Alert', fromEmail: 'security@bank.com', to: 'me@icloud.com', subject: 'New sign-in to your account', body: 'We noticed a new sign-in to your account from a new device.\n\nDevice: iPhone 16 Pro\nLocation: San Francisco, CA\nTime: April 9, 2026 at 3:42 PM\n\nIf this was you, no action is needed.', date: 'Sat', isRead: true, isFlagged: false },
];

const SENT_STORAGE_KEY = '@iostoandroid/mail_sent';

function getInitials(name: string): string {
  const parts = name.split(' ');
  return parts.map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['#007AFF', '#5856D6', '#FF9500', '#34C759', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55'];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MailScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  const [emails, setEmails] = useState(DEMO_EMAILS);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const unreadCount = emails.filter(e => !e.isRead).length;

  const handleOpenEmail = useCallback((email: Email) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
    setSelectedEmail(email);
  }, []);

  const handleArchive = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEmails(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleDelete = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setEmails(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleFlag = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, isFlagged: !e.isFlagged } : e));
  }, []);

  const handleSend = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      alert('Missing Fields', 'Please fill in To and Subject.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sent = {
      id: Date.now().toString(),
      to: composeTo.trim(),
      subject: composeSubject.trim(),
      body: composeBody.trim(),
      date: new Date().toISOString(),
    };
    try {
      const existing = await AsyncStorage.getItem(SENT_STORAGE_KEY);
      const list = existing ? JSON.parse(existing) : [];
      list.unshift(sent);
      await AsyncStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
    setShowCompose(false);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    alert('Sent', 'Your message has been sent.');
  }, [composeTo, composeSubject, composeBody, alert]);

  // ─── Email Detail View ─────────────────────────────────────────────────────
  if (selectedEmail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
        <CupertinoNavigationBar
          title=""
          largeTitle={false}
          leftButton={
            <Pressable onPress={() => setSelectedEmail(null)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
              <Text style={[typography.body, { color: colors.systemBlue }]}>Inbox</Text>
            </Pressable>
          }
          rightButton={
            <Pressable onPress={() => handleFlag(selectedEmail.id)}>
              <Ionicons name={selectedEmail.isFlagged ? 'flag' : 'flag-outline'} size={22} color={colors.systemOrange ?? '#FF9500'} />
            </Pressable>
          }
        />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
          <Text style={[typography.title2, { color: colors.label, marginBottom: 12 }]}>{selectedEmail.subject}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={[styles.avatar, { backgroundColor: avatarColor(selectedEmail.from) }]}>
              <Text style={styles.avatarText}>{getInitials(selectedEmail.from)}</Text>
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[typography.headline, { color: colors.label }]}>{selectedEmail.from}</Text>
              <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>{selectedEmail.fromEmail}</Text>
              <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>To: {selectedEmail.to}</Text>
            </View>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>{selectedEmail.date}</Text>
          </View>
          <Text style={[typography.body, { color: colors.label, lineHeight: 22 }]}>{selectedEmail.body}</Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.systemBlue }]}
              onPress={() => { setSelectedEmail(null); setShowCompose(true); setComposeTo(selectedEmail.fromEmail); setComposeSubject(`Re: ${selectedEmail.subject}`); }}
            >
              <Ionicons name="return-up-back" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Reply</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.systemBlue }]}
              onPress={() => { setSelectedEmail(null); setShowCompose(true); setComposeSubject(`Fwd: ${selectedEmail.subject}`); setComposeBody(`\n\n---------- Forwarded ----------\nFrom: ${selectedEmail.from}\n\n${selectedEmail.body}`); }}
            >
              <Ionicons name="return-up-forward" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Forward</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Inbox List ────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <CupertinoNavigationBar
        title={`Inbox${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        leftButton={
          <Text style={[typography.body, { color: colors.systemBlue }]} onPress={() => navigation.goBack()}>
            Back
          </Text>
        }
        rightButton={
          <Pressable onPress={() => setShowCompose(true)}>
            <Ionicons name="create-outline" size={24} color={colors.systemBlue} />
          </Pressable>
        }
      />

      <FlatList
        data={emails}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: 76 }]} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="mail-open-outline" size={56} color={colors.systemGray3} />
            <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>No Mail</Text>
            <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: 8 }]}>Your inbox is empty.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CupertinoSwipeableRow
            actions={[
              { label: 'Archive', color: '#007AFF', onPress: () => handleArchive(item.id) },
              { label: 'Flag', color: '#FF9500', onPress: () => handleFlag(item.id) },
              { label: 'Trash', color: '#FF3B30', onPress: () => handleDelete(item.id) },
            ]}
          >
            <Pressable
              style={[styles.emailRow, { backgroundColor: colors.systemBackground }]}
              onPress={() => handleOpenEmail(item)}
            >
              {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.systemBlue }]} />}
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.from) }]}>
                <Text style={styles.avatarText}>{getInitials(item.from)}</Text>
              </View>
              <View style={styles.emailContent}>
                <View style={styles.emailHeader}>
                  <Text style={[item.isRead ? typography.body : typography.headline, { color: colors.label, flex: 1 }]} numberOfLines={1}>
                    {item.from}
                  </Text>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>{item.date}</Text>
                  {item.isFlagged && <Ionicons name="flag" size={14} color="#FF9500" style={{ marginLeft: 4 }} />}
                  <Ionicons name="chevron-forward" size={14} color={colors.systemGray3} style={{ marginLeft: 2 }} />
                </View>
                <Text style={[typography.callout, { color: colors.label }]} numberOfLines={1}>{item.subject}</Text>
                <Text style={[typography.caption1, { color: colors.secondaryLabel }]} numberOfLines={1}>{item.body}</Text>
              </View>
            </Pressable>
          </CupertinoSwipeableRow>
        )}
      />

      {/* Compose Modal */}
      <Modal visible={showCompose} animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.systemBackground }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.composeHeader, { borderBottomColor: colors.separator, paddingTop: insets.top }]}>
            <Pressable onPress={() => setShowCompose(false)}>
              <Text style={[typography.body, { color: colors.systemRed }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.headline, { color: colors.label }]}>New Message</Text>
            <Pressable onPress={handleSend}>
              <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>Send</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <TextInput
              style={[styles.composeField, { color: colors.label, borderBottomColor: colors.separator }]}
              placeholder="To:"
              placeholderTextColor={colors.secondaryLabel}
              value={composeTo}
              onChangeText={setComposeTo}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.composeField, { color: colors.label, borderBottomColor: colors.separator }]}
              placeholder="Subject:"
              placeholderTextColor={colors.secondaryLabel}
              value={composeSubject}
              onChangeText={setComposeSubject}
            />
            <TextInput
              style={[styles.composeBody, { color: colors.label }]}
              placeholder="Write your email..."
              placeholderTextColor={colors.secondaryLabel}
              value={composeBody}
              onChangeText={setComposeBody}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', left: 4, top: '50%' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emailContent: { flex: 1, marginLeft: 12 },
  emailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  separator: { height: StyleSheet.hairlineWidth },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  composeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  composeField: { fontSize: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  composeBody: { fontSize: 16, minHeight: 200, paddingTop: 12 },
});
