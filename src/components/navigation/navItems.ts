import { Ionicons } from '@expo/vector-icons';

export interface NavItem {
  /** Stable identifier used for selection state and callbacks. */
  id: string;
  /** Human-readable label shown in the chrome. */
  label: string;
  /** Ionicons glyph name for the item. */
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * The primary destinations surfaced by the layout chrome. The home launcher is
 * the root of the app; the rest are the built-in "apps" an iOS user expects one
 * tap away (Phone, Messages, Contacts) plus Settings.
 *
 * This single list drives BOTH the tablet sidebar and the phone tab bar (#633),
 * so the two form factors always stay in sync — adding/removing a destination
 * here updates both chromes at once.
 */
export const TABLET_NAV_ITEMS: NavItem[] = [
  { id: 'Home', label: 'Home', icon: 'home' },
  { id: 'Phone', label: 'Phone', icon: 'call' },
  { id: 'Messages', label: 'Messages', icon: 'chatbubble' },
  { id: 'Contacts', label: 'Contacts', icon: 'people' },
  { id: 'Settings', label: 'Settings', icon: 'settings' },
];

/**
 * Maps a `TABLET_NAV_ITEMS` id to the stack route it opens (#651-B). Kept as
 * the single source of truth alongside its inverse so the sidebar/tab bar
 * selection and the stack's current route can never drift apart.
 */
export const NAV_ITEM_TO_ROUTE = {
  Home: 'HomeMain',
  Phone: 'Phone',
  Messages: 'Messages',
  Contacts: 'Contacts',
  Settings: 'Settings',
} as const;

export const ROUTE_TO_NAV_ITEM = {
  HomeMain: 'Home',
  Phone: 'Phone',
  Messages: 'Messages',
  Contacts: 'Contacts',
  Settings: 'Settings',
} as const;
