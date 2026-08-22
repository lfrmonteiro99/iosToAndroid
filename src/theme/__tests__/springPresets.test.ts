import {
  navigation,
  interactive,
  sheet,
  wobble,
  snap,
  SpringPresets,
  actionSheetPresent,
  alertDialogPresent,
  assistiveTouchSnap,
  assistiveTouchMenuReveal,
  reactionPickerPop,
  notificationBannerEnter,
  notificationBannerScale,
  launcherIconPress,
  feedbackSettle,
} from '../springPresets';

describe('springPresets — §3.1 usage-named vocabulary', () => {
  it('defines the five presets from ESPECIFICACAO.md §3.1, by usage not by feel', () => {
    expect(navigation).toEqual({ damping: 18, stiffness: 180, mass: 1 });
    expect(interactive).toEqual({ damping: 12, stiffness: 220, mass: 1 });
    expect(sheet).toEqual({ damping: 20, stiffness: 160, mass: 1 });
    expect(wobble).toEqual({ damping: 8, stiffness: 300, mass: 0.8 });
    expect(snap).toEqual({ damping: 26, stiffness: 400, mass: 1 });
  });

  it('wobble is the only §3.1 preset with mass different from 1', () => {
    const massOneCount = Object.values(SpringPresets).filter((p) => p.mass === 1).length;
    expect(massOneCount).toBe(4);
    expect(SpringPresets.wobble.mass).not.toBe(1);
  });

  it('exposes exactly the five presets under one vocabulary object', () => {
    expect(Object.keys(SpringPresets).sort()).toEqual(
      ['interactive', 'navigation', 'sheet', 'snap', 'wobble'].sort(),
    );
  });

  it('no two of the five presets share the same (damping, stiffness, mass) tuple', () => {
    const seen = new Set<string>();
    for (const p of Object.values(SpringPresets)) {
      const key = `${p.damping}/${p.stiffness}/${p.mass}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('consolidates the pre-existing inline call-site springs unchanged (no value drift)', () => {
    // These match the literals that used to be scattered across component files —
    // consolidation must not silently alter behaviour (issue #492 ressalva).
    expect(actionSheetPresent).toEqual({ damping: 25, stiffness: 300, mass: 1 });
    expect(alertDialogPresent).toEqual({ damping: 25, stiffness: 500, mass: 1 });
    expect(assistiveTouchSnap).toEqual({ damping: 18, stiffness: 220, mass: 1 });
    expect(assistiveTouchMenuReveal).toEqual({ damping: 14, stiffness: 220, mass: 1 });
    expect(reactionPickerPop).toEqual({ damping: 18, stiffness: 400, mass: 1 });
    expect(notificationBannerEnter).toEqual({ damping: 22, stiffness: 350, mass: 0.8 });
    expect(notificationBannerScale).toEqual({ damping: 22, stiffness: 350, mass: 1 });
    expect(launcherIconPress).toEqual({ damping: 12, stiffness: 200, mass: 1 });
    expect(feedbackSettle).toEqual({ damping: 20, stiffness: 300, mass: 1 });
  });
});
