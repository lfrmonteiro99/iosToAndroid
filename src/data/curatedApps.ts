/**
 * Hand-picked catalog backing the App Store screen's "Today" section.
 *
 * Android has no public, key-free API to search or enumerate apps that are NOT
 * installed on the device, so there is no honest way to render "live Play Store
 * data" here. This static list is the catalog: every entry is a well-known app
 * whose applicationId is stable and publicly verifiable at
 * `https://play.google.com/store/apps/details?id=<packageName>`.
 *
 * Package names are NOT invented — do not add an entry without checking the
 * Play Store listing above resolves for it.
 */
export interface CuratedApp {
  name: string;
  packageName: string;
  category: string;
  tagline: string;
}

export const CURATED_APPS: CuratedApp[] = [
  {
    name: 'Spotify',
    packageName: 'com.spotify.music',
    category: 'Music',
    tagline: 'Millions of songs and podcasts, free.',
  },
  {
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    category: 'Social Networking',
    tagline: 'Simple, reliable, private messaging.',
  },
  {
    name: 'Telegram',
    packageName: 'org.telegram.messenger',
    category: 'Social Networking',
    tagline: 'Fast messaging with cloud chats.',
  },
  {
    name: 'Netflix',
    packageName: 'com.netflix.mediaclient',
    category: 'Entertainment',
    tagline: 'Series and films, wherever you are.',
  },
  {
    name: 'Duolingo',
    packageName: 'com.duolingo',
    category: 'Education',
    tagline: 'Learn a language in five minutes a day.',
  },
  {
    name: 'Firefox',
    packageName: 'org.mozilla.firefox',
    category: 'Utilities',
    tagline: 'Private browsing that blocks trackers.',
  },
  {
    name: 'Instagram',
    packageName: 'com.instagram.android',
    category: 'Photo & Video',
    tagline: 'Share photos, reels and stories.',
  },
  {
    name: 'Todoist',
    packageName: 'com.todoist',
    category: 'Productivity',
    tagline: 'Organise work and life in one list.',
  },
];
