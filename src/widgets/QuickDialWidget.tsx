/**
 * The Favourites widget (#963): the people you call, one tap each.
 *
 * ContactsStore already keeps a favourites list and nothing on the home screen
 * used it. Unlike the rest of the set this widget's content is PEOPLE, so its
 * card is a row of avatars rather than a figure — which is the point of adding
 * it: variety in the widget set is variety of shape, not of number.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CupertinoPressable } from '../components/CupertinoPressable';
import { useTheme } from '../theme/ThemeContext';
import { avatarColorForName } from '../utils/avatarColor';
import { WidgetCard } from './WidgetCard';
import { widgetInk, widgetPalette } from './widgetPalettes';

export interface QuickDialContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** How many fit a medium card without the avatars shrinking to dots. */
export const QUICK_DIAL_SLOTS = 4;

export function displayName(contact: QuickDialContact): string {
  return `${contact.firstName} ${contact.lastName}`.trim() || contact.phone;
}

export function initials(contact: QuickDialContact): string {
  const first = contact.firstName?.[0] ?? '';
  const last = contact.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

/**
 * The favourites the card can show.
 *
 * A contact with no number is dropped rather than shown greyed: the whole
 * widget is "tap to call", and a face that cannot be called is a dead key.
 */
export function dialableFavourites(
  contacts: readonly QuickDialContact[],
  slots = QUICK_DIAL_SLOTS,
): QuickDialContact[] {
  return contacts
    .filter((c) => c && typeof c.phone === 'string' && c.phone.trim().length > 0)
    .slice(0, slots);
}

export function QuickDialWidget({ contacts = [], onCall, onPress }: {
  contacts?: readonly QuickDialContact[];
  onCall?: (contact: QuickDialContact) => void;
  onPress?: () => void;
}) {
  const { textScale } = useTheme();
  const palette = widgetPalette('quickDial');
  const ink = widgetInk('quickDial');
  const shown = dialableFavourites(contacts);

  return (
    <WidgetCard
      testID="widget-card-quickDial"
      onPress={shown.length === 0 ? onPress : undefined}
      appearance={palette?.appearance}
      accessibilityLabel="Favourites"
    >
      <View style={styles.header}>
        <Ionicons name="call" size={16} color={ink.primary} />
        <Text style={[styles.title, { color: ink.title, fontSize: 13 * textScale }]}>
          Favourites
        </Text>
      </View>

      {shown.length === 0 ? (
        <Text style={[styles.empty, { color: ink.secondary, fontSize: 13 * textScale }]}>
          Mark a contact as a favourite to call them from here
        </Text>
      ) : (
        <View style={styles.row}>
          {shown.map((contact) => (
            <CupertinoPressable
              key={contact.id}
              onPress={() => onCall?.(contact)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${displayName(contact)}`}
              style={styles.slot}
            >
              <View
                style={[styles.avatar, { backgroundColor: avatarColorForName(displayName(contact)) }]}
              >
                <Text style={[styles.initials, { fontSize: 15 * textScale }]}>
                  {initials(contact)}
                </Text>
              </View>
              <Text
                style={[styles.name, { color: ink.primary, fontSize: 11 * textScale }]}
                numberOfLines={1}
              >
                {contact.firstName || contact.phone}
              </Text>
            </CupertinoPressable>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '600' },
  empty: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 10,
  },
  slot: { alignItems: 'center', flex: 1, gap: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '600' },
  name: { fontWeight: '500', maxWidth: 56, textAlign: 'center' },
});
