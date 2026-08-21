/**
 * Pure superellipse and squircle path generators.
 * No React or React Native dependencies — just geometry.
 *
 * Reference: Superellipse equation |x/a|^n + |y/b|^n = 1
 */

/** Generate SVG path for a superellipse (squircle shape). */
export function superellipsePath(size: number, n = 4.7, segments = 64): string {
  const a = size / 2;
  const b = size / 2;
  const center = size / 2;

  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const x = a * signedPow(Math.cos(angle), 2 / n);
    const y = b * signedPow(Math.sin(angle), 2 / n);

    points.push({
      x: center + x,
      y: center + y,
    });
  }

  return buildSvgPath(points);
}

/**
 * Generate SVG path for a rectangle with superellipse-curved corners.
 * Straight sides with superellipse arcs in the corners.
 */
export function squirclePathRect(
  w: number,
  h: number,
  radius: number,
  n = 4.0,
  segments = 16,
): string {
  // Limit radius to half the smaller dimension
  const maxRadius = Math.min(w, h) / 2;
  const r = Math.min(radius, maxRadius);

  const points: Array<{ x: number; y: number }> = [];

  // Top-left corner arc: from (r, 0) to (0, r)
  const topLeftArc = generateCornerArc(r, r, Math.PI, 1.5 * Math.PI, n, segments);
  points.push(...topLeftArc);

  // Top edge: from (r, 0) to (w - r, 0)
  points.push({ x: w - r, y: 0 });

  // Top-right corner arc: from (w - r, 0) to (w, r)
  const topRightArc = generateCornerArc(w - r, r, 1.5 * Math.PI, 2 * Math.PI, n, segments);
  points.push(...topRightArc);

  // Right edge: from (w, r) to (w, h - r)
  points.push({ x: w, y: h - r });

  // Bottom-right corner arc: from (w, h - r) to (w - r, h)
  const bottomRightArc = generateCornerArc(
    w - r,
    h - r,
    0,
    0.5 * Math.PI,
    n,
    segments,
  );
  points.push(...bottomRightArc);

  // Bottom edge: from (w - r, h) to (r, h)
  points.push({ x: r, y: h });

  // Bottom-left corner arc: from (r, h) to (0, h - r)
  const bottomLeftArc = generateCornerArc(r, h - r, 0.5 * Math.PI, Math.PI, n, segments);
  points.push(...bottomLeftArc);

  // Left edge: from (0, h - r) to (0, r)
  // (back to start, close with Z)

  return buildSvgPath(points);
}

/**
 * Generate a superellipse arc for a corner.
 * Returns points along the arc from startAngle to endAngle.
 */
function generateCornerArc(
  centerX: number,
  centerY: number,
  startAngle: number,
  endAngle: number,
  n: number,
  segments: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const arcSegments = Math.ceil(segments / 4) || 1; // Use ~1/4 of total segments per corner

  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const angle = startAngle + t * (endAngle - startAngle);

    // Superellipse point at this angle, relative to corner center
    const sx = signedPow(Math.cos(angle), 2 / n);
    const sy = signedPow(Math.sin(angle), 2 / n);

    // Scale by radius and translate to corner center
    const x = centerX + sx;
    const y = centerY + sy;

    points.push({ x, y });
  }

  return points;
}

/** Signed power: preserves sign of base when computing fractional exponent. */
function signedPow(base: number, exp: number): number {
  return Math.sign(base) * Math.pow(Math.abs(base), exp);
}

/** Convert points array to SVG path string. */
function buildSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';

  // Start at first point
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;

  // Line to each subsequent point
  for (let i = 1; i < points.length; i++) {
    path += ` L ${round(points[i].x)} ${round(points[i].y)}`;
  }

  // Close the path
  path += ' Z';

  return path;
}

/** Round number to 2 decimal places for SVG compactness. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
