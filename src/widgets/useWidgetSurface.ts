/**
 * One hook every widget calls for its ground and its ink (#965).
 *
 * It exists so that the tinted home-screen setting reaches every widget without
 * each one reading Settings and re-implementing the precedence. The resolution
 * itself stays in widgetPalettes.ts, pure and tested; this is only the wiring.
 */
import { useMemo } from 'react';
import { useSettings } from '../store/SettingsStore';
import type { WidgetType } from './TodayWidgets';
import type { WidgetOptions } from './widgetInstances';
import { WIDGET_INK, widgetSurface, type WidgetInkTone, type WidgetPalette } from './widgetPalettes';

export interface WidgetSurface {
  palette: WidgetPalette | null;
  ink: typeof WIDGET_INK[WidgetInkTone];
  /** The accent, already falling back to the ink's primary tone. */
  accent: string;
}

export function useWidgetSurface(type: WidgetType, options?: WidgetOptions): WidgetSurface {
  const { settings } = useSettings();
  const systemTint = settings.iconTintEnabled ? settings.iconTintColor : null;

  return useMemo(() => {
    const palette = widgetSurface(type, options, systemTint);
    const ink = WIDGET_INK[palette?.ink ?? 'onDark'];
    return { palette, ink, accent: palette?.accent ?? ink.primary };
  }, [type, options, systemTint]);
}
