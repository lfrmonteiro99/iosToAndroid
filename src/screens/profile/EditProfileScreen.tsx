// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React, { useState } from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useProfile } from '../../store/ProfileStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoTextField,
  useAlert,
} from '../../components';

function isValidEmail(e: string): boolean {
  return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EditProfileScreen({ navigation }: { navigation: any; route: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { profile, updateProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.bio);
  const [emailError, setEmailError] = useState(false);

  function handleSave() {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setEmailError(true);
      alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setEmailError(false);
    updateProfile({ name: name.trim(), email: trimmedEmail, bio: bio.trim() });
    navigation.goBack();
  }

  const iconColor = colors.systemGray;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Edit Profile"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
          </Pressable>
        }
        rightButton={
          <Pressable onPress={handleSave} hitSlop={8}>
            <Text style={[typography.headline, { color: colors.systemBlue }]}>Save</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + 90,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CupertinoListSection header="Name">
          <CupertinoTextField
            value={name}
            onChangeText={setName}
            placeholder="Full Name"
            autoCapitalize="words"
            autoCorrect={false}
            prefix={<Ionicons name="person-outline" size={18} color={iconColor} />}
            returnKeyType="next"
          />
        </CupertinoListSection>

        <CupertinoListSection header="Email">
          <CupertinoTextField
            value={email}
            onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(false); }}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            prefix={<Ionicons name="mail-outline" size={18} color={iconColor} />}
            returnKeyType="next"
          />
        </CupertinoListSection>
        {emailError && (
          <Text style={styles.emailError}>Invalid email format</Text>
        )}

        <CupertinoListSection header="Bio">
          <CupertinoTextField
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself..."
            multiline
            numberOfLines={5}
            prefix={<Ionicons name="document-text-outline" size={18} color={iconColor} />}
            returnKeyType="done"
            containerStyle={styles.bioField}
            textAlignVertical="top"
          />
        </CupertinoListSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  bioField: {
    minHeight: 120,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  emailError: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
    marginHorizontal: 20,
  },
});
