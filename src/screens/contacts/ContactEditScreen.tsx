import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useContacts } from '../../store/ContactsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoTextField,
} from '../../components';
import type { AppNavigationProp, AppRouteProp } from '../../navigation/types';

interface ContactEditScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'ContactEdit'>;
}

export function ContactEditScreen({ navigation, route }: ContactEditScreenProps) {
  const { contactId } = route.params ?? {};
  const isEditMode = Boolean(contactId);

  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { getContact, addContact, updateContact } = useContacts();
  const insets = useSafeAreaInsets();

  const existing = contactId ? getContact(contactId) : undefined;

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [company, setCompany] = useState(existing?.company ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function isValidPhone(p: string): boolean {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 7;
  }

  function isValidEmail(e: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  const phoneInvalid = phone.trim().length > 0 && !isValidPhone(phone);
  const emailInvalid = email.trim().length > 0 && !isValidEmail(email);
  const firstNameEmpty = firstName.trim().length === 0;

  const canSave =
    !firstNameEmpty &&
    lastName.trim().length > 0 &&
    phone.trim().length > 0 &&
    isValidPhone(phone) &&
    !emailInvalid;

  function handleDone() {
    if (!canSave) return;
    if (isEditMode && contactId) {
      updateContact(contactId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      addContact({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        notes: notes.trim() || undefined,
        isFavorite: false,
      });
    }
    navigation.goBack();
  }

  const iconColor = colors.systemGray;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title={isEditMode ? 'Edit Contact' : 'New Contact'}
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
          </Pressable>
        }
        rightButton={
          <Pressable onPress={handleDone} disabled={!canSave} hitSlop={8}>
            <Text
              style={[
                typography.headline,
                { color: canSave ? colors.systemBlue : colors.secondaryLabel },
              ]}
            >
              Done
            </Text>
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
        {/* Name section */}
        <CupertinoListSection>
          <CupertinoTextField
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name"
            autoCapitalize="words"
            autoCorrect={false}
            prefix={<Ionicons name="person-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
          <CupertinoTextField
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
            autoCapitalize="words"
            autoCorrect={false}
            prefix={<Ionicons name="person-outline" size={18} color="transparent" />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>
        {firstNameEmpty && lastName.length > 0 && (
          <Text style={styles.validationError}>First name is required</Text>
        )}

        {/* Phone section */}
        <CupertinoListSection>
          <CupertinoTextField
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            keyboardType="phone-pad"
            prefix={<Ionicons name="call-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>
        {phoneInvalid && (
          <Text style={styles.validationError}>Enter a valid phone number (at least 7 digits)</Text>
        )}

        {/* Email section */}
        <CupertinoListSection>
          <CupertinoTextField
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            prefix={<Ionicons name="mail-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>
        {emailInvalid && (
          <Text style={styles.validationError}>Invalid email address</Text>
        )}

        {/* Company section */}
        <CupertinoListSection>
          <CupertinoTextField
            value={company}
            onChangeText={setCompany}
            placeholder="Company"
            autoCapitalize="words"
            prefix={<Ionicons name="business-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>

        {/* Notes section */}
        <CupertinoListSection header="Notes">
          <CupertinoTextField
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            multiline
            numberOfLines={4}
            prefix={<Ionicons name="document-text-outline" size={18} color={iconColor} />}
            returnKeyType="done"
            containerStyle={{ ...styles.fieldContainer, ...styles.notesField }}
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
  fieldContainer: {
    marginBottom: 1,
  },
  notesField: {
    minHeight: 100,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  validationError: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 4,
  },
});
