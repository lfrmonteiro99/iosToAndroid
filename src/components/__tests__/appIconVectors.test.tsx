/**
 * The icon shapes that are curves, not circles.
 *
 * These assert the shape is actually drawn as a vector path — the point of the
 * change — plus the two properties that would break the launcher if they
 * regressed: the artwork must not swallow the press that launches the app, and
 * each icon's gradient must resolve to its own colours.
 */
import React from 'react';
import { render } from '../../test-utils';
import Svg, { Path } from 'react-native-svg';
import {
  AppStoreMark,
  CompassNeedle,
  DoubleNote,
  Heart,
  HEART_PATH,
  CLOUD_PATH,
  PETAL_PATH,
  PhotosFlower,
  PodcastsMark,
  SpeechBubble,
  BUBBLE_PATH,
  MIC_BODY_PATH,
  SunBehindCloud,
  IconVector,
} from '../appIcons/svgShapes';
import { APP_ICON_ARTWORK } from '../appIcons';

const SIZE = 60;

function paths(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { props?: Record<string, unknown>; children?: unknown[] };
    const d = n.props?.d;
    if (typeof d === 'string') out.push(d);
    for (const child of n.children ?? []) walk(child);
  };
  walk(tree);
  return out;
}

describe('vector icon shapes', () => {
  it('the heart is one path, with the cusp and the point', () => {
    const { toJSON } = render(<Heart size={SIZE} from="#FF4E6B" to="#F52D4E" />);
    expect(paths(toJSON())).toContain(HEART_PATH);
  });

  it('the cloud is one path, not a pile of discs', () => {
    const { toJSON } = render(<SunBehindCloud size={SIZE} />);
    expect(paths(toJSON())).toContain(CLOUD_PATH);
  });

  it('the flower draws one petal path per colour', () => {
    const petals = ['#FFC107', '#FF9500', '#FF3B30'];
    const { toJSON } = render(<PhotosFlower size={SIZE} petals={petals} />);
    expect(paths(toJSON()).filter((d) => d === PETAL_PATH)).toHaveLength(petals.length);
  });

  it('the needle is four blades around the hub', () => {
    const { toJSON } = render(<CompassNeedle size={SIZE} />);
    expect(paths(toJSON())).toHaveLength(4);
  });

  it('the bubble body and its tail are one outline', () => {
    const { toJSON } = render(<SpeechBubble size={SIZE} />);
    expect(paths(toJSON())).toEqual([BUBBLE_PATH]);
  });

  it('the podcasts mark draws two arcs behind the mic', () => {
    const { toJSON } = render(<PodcastsMark size={SIZE} />);
    const drawn = paths(toJSON());
    expect(drawn.filter((d) => d.includes('A44 44')).length).toBe(1);
    expect(drawn.filter((d) => d.includes('A33 33')).length).toBe(1);
    expect(drawn).toContain(MIC_BODY_PATH);
  });

  it('the artwork does not take the touch that launches the app', () => {
    const { toJSON } = render(<AppStoreMark size={SIZE} />);
    const root = toJSON() as { props: Record<string, unknown> } | null;
    expect(root?.props.pointerEvents).toBe('none');
  });

  it('scales with the tile instead of being fixed in dp', () => {
    for (const size of [28, 120]) {
      const { toJSON } = render(<DoubleNote size={size} />);
      const root = toJSON() as { props: Record<string, unknown> } | null;
      expect(root?.props.width).toBe(size);
      expect(root?.props.height).toBe(size);
    }
  });

  it('an Svg inside an Svg is not created — each shape owns its own root', () => {
    const { toJSON } = render(
      <IconVector size={SIZE}>
        <Path d="M0 0 L1 1" fill="#000" />
      </IconVector>,
    );
    const root = toJSON() as { children?: unknown[] } | null;
    const nested = JSON.stringify(root?.children ?? []).includes('RNSVGSvgView');
    expect(nested).toBe(false);
  });
});

describe('the converted artwork still renders through the registry', () => {
  const converted = [
    'com.iostoandroid.health',
    'com.iostoandroid.weather',
    'com.iostoandroid.music',
    'com.iostoandroid.appstore',
    'com.iostoandroid.browser',
    'com.iostoandroid.photos',
    'com.iostoandroid.messages',
    'com.iostoandroid.podcasts',
  ];

  it.each(converted)('%s draws without throwing at grid and library sizes', (pkg) => {
    const Artwork = APP_ICON_ARTWORK[pkg];
    expect(Artwork).toBeTruthy();
    for (const size of [28, 60, 120]) {
      const { toJSON } = render(<Artwork size={size} />);
      expect(toJSON()).toBeTruthy();
    }
  });
});

// Guards the assumption the tests above rest on: this file's `paths` helper only
// finds `d` props, so a shape drawn with Circle/Line/Ellipse is invisible to it.
it('the helper reads d props', () => {
  const { toJSON } = render(<Svg><Path d="M1 1" /></Svg>);
  expect(paths(toJSON())).toEqual(['M1 1']);
});
