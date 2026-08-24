import { useEffect } from 'react';
import LauncherModule from '../../modules/launcher-module/src';

export interface LiveActivityContent {
  title: string;
  text: string;
  progress: number;
  maxProgress: number;
}

export interface UseLiveActivityOptions {
  /** Stable identifier for this activity; doubles as the notification's upsert key. */
  id: string;
  /** Whether the activity should currently be posted. Flipping to false (or unmounting) cancels it. */
  active: boolean;
  content: LiveActivityContent;
}

/**
 * Android equivalent of iOS Live Activities (#626): keeps one ongoing
 * notification (LauncherModule.postLiveActivity) in sync with `content`
 * while `active` is true, and cancels it when `active` turns false or the
 * component unmounts.
 *
 * A blank `id` never touches the native bridge — there would be nothing
 * stable to update or cancel later, so the activity is treated as inactive.
 *
 * The two concerns are split into separate effects on purpose: posting reacts
 * to every content/active/id change (so progress ticks update the existing
 * notification in place), while cancellation only depends on [id, active] —
 * a content-only change must never cancel-then-repost, or the ongoing
 * notification would flicker instead of updating.
 */
export function useLiveActivity({ id, active, content }: UseLiveActivityOptions): void {
  useEffect(() => {
    if (!id || !active) return;
    LauncherModule.postLiveActivity(id, content.title, content.text, content.progress, content.maxProgress);
  }, [id, active, content.title, content.text, content.progress, content.maxProgress]);

  useEffect(() => {
    if (!id || !active) return undefined;
    return () => {
      LauncherModule.cancelLiveActivity(id);
    };
  }, [id, active]);
}
