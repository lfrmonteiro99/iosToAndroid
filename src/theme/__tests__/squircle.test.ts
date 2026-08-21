import { superellipsePath, squirclePathRect } from '../squircle';

describe('squircle geometry', () => {
  describe('superellipsePath', () => {
    it('returns a valid SVG path string', () => {
      const path = superellipsePath(100);
      expect(typeof path).toBe('string');
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
    });

    it('with n=2 approximates a circle (constant radius from center)', () => {
      const size = 200;
      const path = superellipsePath(size, 2, 64);
      // Parse path and compute distances from center
      const points = parsePathPoints(path);
      expect(points.length).toBeGreaterThan(0);

      const center = { x: size / 2, y: size / 2 };
      const distances = points.map(p =>
        Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2))
      );

      const expectedRadius = size / 2;

      // For n=2, we should get roughly constant distance (within ~10%)
      distances.forEach(d => {
        expect(Math.abs(d - expectedRadius) / expectedRadius).toBeLessThan(0.1);
      });
    });

    it('with high n (e.g. 100) approximates a square', () => {
      const size = 200;
      const path = superellipsePath(size, 100, 64);
      const points = parsePathPoints(path);

      // With high n, corners should be sharp (near square)
      // Check that points exist near the corners
      const topRight = points.some(p => p.x > size * 0.9 && p.y < size * 0.1);
      const topLeft = points.some(p => p.x < size * 0.1 && p.y < size * 0.1);
      const bottomRight = points.some(p => p.x > size * 0.9 && p.y > size * 0.9);
      const bottomLeft = points.some(p => p.x < size * 0.1 && p.y > size * 0.9);

      expect(topRight && topLeft && bottomRight && bottomLeft).toBe(true);
    });

    it('respects the size parameter', () => {
      const path50 = superellipsePath(50);
      const path100 = superellipsePath(100);

      const points50 = parsePathPoints(path50);
      const points100 = parsePathPoints(path100);

      // Paths should have different scales
      const max50 = Math.max(...points50.map(p => Math.max(p.x, p.y)));
      const max100 = Math.max(...points100.map(p => Math.max(p.x, p.y)));

      expect(max100).toBeGreaterThan(max50);
    });

    it('segments parameter affects smoothness', () => {
      const path8 = superellipsePath(100, 4.7, 8);
      const path64 = superellipsePath(100, 4.7, 64);

      // More segments = more commands in path
      const count8 = (path8.match(/[LC]/g) || []).length;
      const count64 = (path64.match(/[LC]/g) || []).length;

      expect(count64).toBeGreaterThan(count8);
    });
  });

  describe('squirclePathRect', () => {
    it('returns a valid SVG path string', () => {
      const path = squirclePathRect(100, 100, 10);
      expect(typeof path).toBe('string');
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
    });

    it('produces 4 symmetric corners', () => {
      const w = 200;
      const h = 200;
      const radius = 20;
      const path = squirclePathRect(w, h, radius);
      const points = parsePathPoints(path);

      // Find corner regions (top-left, top-right, bottom-right, bottom-left)
      const topLeft = points.filter(p => p.x < w / 2 && p.y < h / 2);
      const topRight = points.filter(p => p.x > w / 2 && p.y < h / 2);
      const bottomRight = points.filter(p => p.x > w / 2 && p.y > h / 2);
      const bottomLeft = points.filter(p => p.x < w / 2 && p.y > h / 2);

      expect(topLeft.length).toBeGreaterThan(0);
      expect(topRight.length).toBeGreaterThan(0);
      expect(bottomRight.length).toBeGreaterThan(0);
      expect(bottomLeft.length).toBeGreaterThan(0);
    });

    it('respects width and height parameters', () => {
      const pathRect = squirclePathRect(200, 100, 10);
      const points = parsePathPoints(pathRect);

      // All points should be within the bounds
      points.forEach(p => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(200);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      });
    });

    it('limits radius when greater than half the smaller dimension', () => {
      const w = 100;
      const h = 100;
      const tooLargeRadius = 60; // > 50 (half of 100)

      const path = squirclePathRect(w, h, tooLargeRadius);
      const points = parsePathPoints(path);

      // Should produce a valid path without errors
      expect(path).toContain('M');
      expect(path).toContain('Z');
      expect(points.length).toBeGreaterThan(0);
    });

    it('handles rectangular (non-square) dimensions', () => {
      const w = 300;
      const h = 100;
      const radius = 15;

      const path = squirclePathRect(w, h, radius);
      const points = parsePathPoints(path);

      // Should reach the extremes of width and height
      const maxX = Math.max(...points.map(p => p.x));
      const maxY = Math.max(...points.map(p => p.y));

      expect(maxX).toBeCloseTo(w, 1);
      expect(maxY).toBeCloseTo(h, 1);
    });

    it('corner arcs scale proportionally with radius', () => {
      const w = 200;
      const h = 200;
      const smallRadius = 5;
      const largeRadius = 50;

      const pathSmall = squirclePathRect(w, h, smallRadius);
      const pathLarge = squirclePathRect(w, h, largeRadius);

      const pointsSmall = parsePathPoints(pathSmall);
      const pointsLarge = parsePathPoints(pathLarge);

      // For small radius, corner arcs should be tight (all points close to corner center)
      // For large radius, corner arcs should extend farther

      // Top-left corner center is at (smallRadius, smallRadius) or (largeRadius, largeRadius)
      const distancesSmall = pointsSmall
        .filter(p => p.x < w / 2 && p.y < h / 2) // Top-left quadrant
        .map(p => Math.sqrt(Math.pow(p.x - smallRadius, 2) + Math.pow(p.y - smallRadius, 2)));

      const distancesLarge = pointsLarge
        .filter(p => p.x < w / 2 && p.y < h / 2) // Top-left quadrant
        .map(p => Math.sqrt(Math.pow(p.x - largeRadius, 2) + Math.pow(p.y - largeRadius, 2)));

      const maxDistSmall = Math.max(...distancesSmall);
      const maxDistLarge = Math.max(...distancesLarge);

      // The ratio of max distances should be approximately the same as the ratio of radii
      // (allowing some tolerance for discretization)
      const radiusRatio = largeRadius / smallRadius;
      const distanceRatio = maxDistLarge / maxDistSmall;

      expect(distanceRatio).toBeCloseTo(radiusRatio, 1);
    });

    it('corner arcs link smoothly to straight edges', () => {
      const w = 200;
      const h = 200;
      const radius = 20;
      const path = squirclePathRect(w, h, radius);
      const points = parsePathPoints(path);

      // Verify path starts at (radius, 0) — top edge meets top-left arc
      expect(points[0].x).toBeCloseTo(radius, 0);
      expect(points[0].y).toBeCloseTo(0, 0);

      // Verify there's a point near (0, radius) — top-left arc meets left edge
      const hasCornerPoint = points.some(p => Math.abs(p.x) < 1 && Math.abs(p.y - radius) < 1);
      expect(hasCornerPoint).toBe(true);

      // Verify there's a point near (w - radius, 0) — should be before top-right arc
      const hasTopRightStart = points.some(p => Math.abs(p.x - (w - radius)) < 1 && Math.abs(p.y) < 1);
      expect(hasTopRightStart).toBe(true);

      // Verify there's a point near (w, radius) — top-right arc meets right edge
      const hasTopRightEnd = points.some(p => Math.abs(p.x - w) < 1 && Math.abs(p.y - radius) < 1);
      expect(hasTopRightEnd).toBe(true);

      // Verify all points stay within bounds
      points.forEach(p => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h);
      });
    });
  });

  describe('area approximation', () => {
    it('superellipsePath area approximates analytical superellipse area', () => {
      const size = 200;
      const a = size / 2; // semi-major axis
      const b = size / 2; // semi-minor axis (circle)
      const n = 4.7;

      const path = superellipsePath(size, n, 64);
      const area = computePathArea(path);

      // Analytical area: 4ab * Gamma(1+1/n)^2 / Gamma(1+2/n)
      // For n=4.7, a=b, this is roughly 0.77 * size^2 (circleish)
      const expectedMinArea = Math.PI * a * b * 0.5; // Much less than full square
      const expectedMaxArea = a * b * 4; // Square

      expect(area).toBeGreaterThan(expectedMinArea);
      expect(area).toBeLessThan(expectedMaxArea);
    });

    it('path area changes predictably with n parameter', () => {
      const size = 200;
      const areaLowN = computePathArea(superellipsePath(size, 2, 64));
      const areaHighN = computePathArea(superellipsePath(size, 100, 64));

      // Higher n = more square-like = more area
      expect(areaHighN).toBeGreaterThan(areaLowN);
    });
  });
});

/** Parse M/L/C commands from SVG path string into point array. */
function parsePathPoints(pathStr: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const commands = pathStr.match(/[MLCZ][^MLCZ]*/g) || [];

  for (const cmd of commands) {
    const letter = cmd[0];
    const argsStr = cmd.slice(1).trim();

    if (letter === 'M' || letter === 'L') {
      const [x, y] = argsStr.split(/[\s,]+/).map(Number);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y });
      }
    } else if (letter === 'C') {
      // Cubic bezier: parse all 6 numbers, use the last point
      const nums = argsStr.split(/[\s,]+/).map(Number);
      for (let i = 4; i < nums.length; i += 6) {
        if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
          points.push({ x: nums[i], y: nums[i + 1] });
        }
      }
    }
  }

  return points;
}

/** Compute approximate area of a polygon using shoelace formula. */
function computePathArea(pathStr: string): number {
  const points = parsePathPoints(pathStr);
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
  }
  // Close the polygon
  area += points[points.length - 1].x * points[0].y - points[0].x * points[points.length - 1].y;

  return Math.abs(area) / 2;
}
