import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { Shape } from '../CupertinoTheme';
import { SettingsProvider } from '../../store/SettingsStore';

type ShapeEntry = { radiusRatio?: number; radius?: number; n: number };

function renderTheme(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SettingsProvider gateFirstRender={false}>
        <ThemeProvider gateFirstRender={false}>{children}</ThemeProvider>
      </SettingsProvider>
    ),
  });
}

describe('Shape tokens (C6: superellipse curvature)', () => {
  it('locks all Shape token values to prevent silent mutations', () => {
    // This assertion traps any change to radius, radiusRatio, or n.
    // Mutation test: changing card.radius from 10 to 999 MUST fail this test.
    expect(Shape).toEqual({
      icon:        { radiusRatio: 0.2237, n: 4.7 },
      card:        { radius: 10, n: 4.0 },
      sheet:       { radius: 13, n: 4.0 },
      button:      { radius: 10, n: 3.5 },
      widgetSmall: { radius: 22, n: 4.5 },
      dock:        { radius: 34, n: 4.2 },
    });
  });

  it('exports Shape token with all required properties per context', () => {
    expect(Shape).toBeDefined();
    expect(typeof Shape).toBe('object');

    // Each shape context must have radius (or radiusRatio) and n
    const requiredContexts: (keyof typeof Shape)[] = ['icon', 'card', 'sheet', 'button', 'widgetSmall', 'dock'];
    requiredContexts.forEach((context) => {
      expect(Shape).toHaveProperty(context);
      const shapeEntry = Shape[context] as ShapeEntry;
      expect(shapeEntry).toBeDefined();

      // Each entry must have n property for superellipse exponent
      expect(shapeEntry).toHaveProperty('n');
      expect(typeof shapeEntry.n).toBe('number');
      expect(shapeEntry.n).toBeGreaterThan(0);

      // Each entry must have either radius or radiusRatio
      const hasRadius = 'radius' in shapeEntry;
      const hasRadiusRatio = 'radiusRatio' in shapeEntry;
      expect(hasRadius || hasRadiusRatio).toBe(true);
    });
  });

  it('icon shape uses radiusRatio instead of absolute radius', () => {
    expect(Shape.icon).toHaveProperty('radiusRatio');
    const iconShape = Shape.icon as typeof Shape.icon;
    expect(typeof iconShape.radiusRatio).toBe('number');
    expect(iconShape.radiusRatio).toBeGreaterThan(0);
    expect(iconShape.radiusRatio).toBeLessThan(1);
  });

  it('exposes Shape via useTheme hook', () => {
    function ShapeProbe() {
      const { shape } = useTheme();
      return <Text>{`shape=${shape ? 'yes' : 'no'} icon-n=${shape?.icon?.n ?? 'missing'}`}</Text>;
    }

    const { getByText } = renderTheme(<ShapeProbe />);

    expect(getByText(/shape=yes icon-n=/)).toBeTruthy();
  });
});
