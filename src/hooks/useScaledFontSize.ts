import { useSettings } from '../store/SettingsStore';

const SCALE_MAP = { small: 0.85, medium: 1.0, large: 1.15, extraLarge: 1.3 };

export function useScaledFontSize(baseSize: number): number {
  const { settings } = useSettings();
  const scale = SCALE_MAP[settings.textSize] || 1.0;
  return Math.round(baseSize * scale);
}
