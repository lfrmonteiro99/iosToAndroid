package com.iostoandroid.launcher

/**
 * Pure-JVM k-means (k=3) dominant-colour picker for LauncherModule's
 * squircle-corner backfill (§4.1.3 of epic #466). Replaces the four-pixel
 * edge-midpoint average, which returns white for a circular icon on a white
 * fill even when the icon has a distinct saturated logo colour elsewhere.
 *
 * Operates on packed ARGB ints in the same layout as
 * [android.graphics.Bitmap.getPixels] / [android.graphics.Color], decoded by
 * hand so this class stays free of android.* imports and is testable on a
 * plain JVM without a device.
 */
object KMeansColorPicker {

    /** r/g/b all at or above this (0-255) count as "near-white" and are discarded. */
    private const val WHITE_CHANNEL_THRESHOLD = 235

    /** r/g/b all at or below this (0-255) count as "near-black" and are discarded. */
    private const val BLACK_CHANNEL_THRESHOLD = 20

    /**
     * Clusters the opaque pixels of [pixels] into up to [k] groups and returns
     * the centroid of the largest group whose colour is not near-white or
     * near-black — the "dominant colour" of the icon, ignoring plain
     * background/foreground fills. Returns null when every pixel is
     * transparent, or when every cluster gets discarded (e.g. an icon that is
     * itself almost entirely white or black); callers should fall back to a
     * different backfill strategy in that case rather than treat null as a
     * colour.
     */
    fun dominantColor(pixels: IntArray, k: Int = 3, iterations: Int = 10): Int? {
        val opaque = pixels.filter { alphaOf(it) != 0 }.toIntArray()
        if (opaque.isEmpty()) return null

        val effectiveK = minOf(k, opaque.toHashSet().size)
        if (effectiveK == 0) return null

        val centroids = seedCentroids(opaque, effectiveK)
        val assignments = IntArray(opaque.size)

        repeat(iterations) {
            for (i in opaque.indices) {
                assignments[i] = nearestCentroidIndex(opaque[i], centroids)
            }
            val sumR = LongArray(centroids.size)
            val sumG = LongArray(centroids.size)
            val sumB = LongArray(centroids.size)
            val counts = IntArray(centroids.size)
            for (i in opaque.indices) {
                val cluster = assignments[i]
                val pixel = opaque[i]
                sumR[cluster] += redOf(pixel)
                sumG[cluster] += greenOf(pixel)
                sumB[cluster] += blueOf(pixel)
                counts[cluster]++
            }
            for (c in centroids.indices) {
                if (counts[c] > 0) {
                    centroids[c] = packRgb(
                        (sumR[c] / counts[c]).toInt(),
                        (sumG[c] / counts[c]).toInt(),
                        (sumB[c] / counts[c]).toInt()
                    )
                }
            }
        }

        val clusterSizes = IntArray(centroids.size)
        for (cluster in assignments) clusterSizes[cluster]++

        var bestIndex = -1
        var bestSize = -1
        for (c in centroids.indices) {
            if (clusterSizes[c] > 0 && clusterSizes[c] > bestSize && !isNearWhiteOrBlack(centroids[c])) {
                bestSize = clusterSizes[c]
                bestIndex = c
            }
        }
        return if (bestIndex >= 0) centroids[bestIndex] else null
    }

    /**
     * Deterministic k-means++-style seeding: start from the first opaque
     * pixel, then repeatedly pick the pixel farthest (in RGB space) from
     * every centroid chosen so far. No randomness, so the same bitmap always
     * seeds the same clusters — required for the cache-once-per-icon
     * contract and for reproducible tests.
     */
    private fun seedCentroids(pixels: IntArray, k: Int): IntArray {
        val seeds = IntArray(k)
        seeds[0] = pixels[0]
        for (s in 1 until k) {
            var farthestPixel = pixels[0]
            var farthestDistance = -1L
            for (pixel in pixels) {
                var nearestSeedDistance = Long.MAX_VALUE
                for (si in 0 until s) {
                    val d = distanceSq(pixel, seeds[si])
                    if (d < nearestSeedDistance) nearestSeedDistance = d
                }
                if (nearestSeedDistance > farthestDistance) {
                    farthestDistance = nearestSeedDistance
                    farthestPixel = pixel
                }
            }
            seeds[s] = farthestPixel
        }
        return seeds
    }

    private fun nearestCentroidIndex(pixel: Int, centroids: IntArray): Int {
        var best = 0
        var bestDistance = Long.MAX_VALUE
        for (c in centroids.indices) {
            val d = distanceSq(pixel, centroids[c])
            if (d < bestDistance) {
                bestDistance = d
                best = c
            }
        }
        return best
    }

    private fun distanceSq(a: Int, b: Int): Long {
        val dr = (redOf(a) - redOf(b)).toLong()
        val dg = (greenOf(a) - greenOf(b)).toLong()
        val db = (blueOf(a) - blueOf(b)).toLong()
        return dr * dr + dg * dg + db * db
    }

    private fun isNearWhiteOrBlack(color: Int): Boolean {
        val r = redOf(color)
        val g = greenOf(color)
        val b = blueOf(color)
        val nearWhite = r >= WHITE_CHANNEL_THRESHOLD && g >= WHITE_CHANNEL_THRESHOLD && b >= WHITE_CHANNEL_THRESHOLD
        val nearBlack = r <= BLACK_CHANNEL_THRESHOLD && g <= BLACK_CHANNEL_THRESHOLD && b <= BLACK_CHANNEL_THRESHOLD
        return nearWhite || nearBlack
    }

    private fun alphaOf(c: Int) = (c ushr 24) and 0xFF
    private fun redOf(c: Int) = (c ushr 16) and 0xFF
    private fun greenOf(c: Int) = (c ushr 8) and 0xFF
    private fun blueOf(c: Int) = c and 0xFF

    private fun packRgb(r: Int, g: Int, b: Int): Int =
        (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}
