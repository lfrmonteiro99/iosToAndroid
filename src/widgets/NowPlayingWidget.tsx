/**
 * The Now Playing widget (#963).
 *
 * The bridge has had `getNowPlaying` and the three transport calls
 * (`mediaPrev` / `mediaPlayPause` / `mediaNext`) all along, and no widget used
 * them. This is also the only widget in the set the user can ACT on rather than
 * just read — the rest are a number and a tap-through.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CupertinoPressable } from '../components/CupertinoPressable';
import { useTheme } from '../theme/ThemeContext';
import { WidgetCard } from './WidgetCard';
import { widgetInk, widgetPalette } from './widgetPalettes';

export interface NowPlayingTrack {
  title: string;
  artist: string;
  album?: string;
  isPlaying: boolean;
  packageName?: string;
}

/** Whether there is anything to show — an empty title means no session. */
export function hasTrack(track: NowPlayingTrack | null | undefined): boolean {
  return !!track && typeof track.title === 'string' && track.title.trim().length > 0;
}

export function NowPlayingWidget({ track, onPrev, onPlayPause, onNext, onPress }: {
  track?: NowPlayingTrack | null;
  onPrev?: () => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPress?: () => void;
}) {
  const { textScale } = useTheme();
  const palette = widgetPalette('nowPlaying');
  const ink = widgetInk('nowPlaying');
  const playing = hasTrack(track);

  return (
    <WidgetCard
      testID="widget-card-nowPlaying"
      onPress={onPress}
      appearance={palette?.appearance}
      accessibilityLabel={
        playing ? `Now playing: ${track?.title} by ${track?.artist}` : 'Nothing playing'
      }
    >
      <View style={styles.header}>
        <Ionicons name="musical-notes" size={18} color={ink.primary} />
        <Text style={[styles.title, { color: ink.title, fontSize: 13 * textScale }]}>
          {playing ? 'Now Playing' : 'Music'}
        </Text>
      </View>

      {playing ? (
        <>
          <Text
            style={[styles.track, { color: ink.primary, fontSize: 16 * textScale }]}
            numberOfLines={1}
          >
            {track?.title}
          </Text>
          <Text
            style={[styles.artist, { color: ink.secondary, fontSize: 13 * textScale }]}
            numberOfLines={1}
          >
            {track?.artist || 'Unknown artist'}
          </Text>
        </>
      ) : (
        <Text style={[styles.artist, { color: ink.secondary, fontSize: 14 * textScale }]}>
          Nothing playing
        </Text>
      )}

      {/* The controls stay mounted with nothing playing: they are how a paused
          session is resumed, and hiding them would make the card a dead end. */}
      <View style={styles.controls}>
        <Control label="Previous track" icon="play-skip-back" color={ink.primary} onPress={onPrev} />
        <Control
          label={track?.isPlaying ? 'Pause' : 'Play'}
          icon={track?.isPlaying ? 'pause' : 'play'}
          color={ink.primary}
          onPress={onPlayPause}
          size={26}
        />
        <Control label="Next track" icon="play-skip-forward" color={ink.primary} onPress={onNext} />
      </View>
    </WidgetCard>
  );
}

function Control({ label, icon, color, onPress, size = 20 }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  size?: number;
}) {
  return (
    // The app's one press-feedback primitive (§3.2 / #496): an ad hoc
    // `opacity: pressed ? N : 1` is exactly the convention it replaced.
    <CupertinoPressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.control}
    >
      <Ionicons name={icon} size={size} color={color} />
    </CupertinoPressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '600' },
  track: { fontWeight: '700', marginTop: 6 },
  artist: { fontWeight: '400', marginTop: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 8,
  },
  control: { minWidth: 32, alignItems: 'center' },
});
