import { useSettings } from '../store/SettingsStore';

// textSizeIndex: 0=small, 1=medium, 2=large, 3=extraLarge
const SCALE_MAP: Record<number, number> = { 0: 0.85, 1: 1.0, 2: 1.15, 3: 1.3 };

export function useScaledFontSize(baseSize: number): number {
  const { settings } = useSettings();
  const scale = SCALE_MAP[settings.textSizeIndex] ?? 1.0;
  return Math.round(baseSize * scale);
}
