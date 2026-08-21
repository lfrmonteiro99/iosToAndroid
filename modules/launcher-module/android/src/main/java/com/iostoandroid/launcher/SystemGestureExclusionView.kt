package com.iostoandroid.launcher

import android.content.Context
import android.graphics.Rect
import android.os.Build
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * A zero-painting View whose only job is to tell Android "do not steal touches
 * here" via `setSystemGestureExclusionRects`, so the app's left-edge swipe-back
 * (src/components/BackEdgeSwipe.tsx) is not intercepted by the system back
 * gesture before it ever reaches the app.
 *
 * `systemGestureExclusionRects` does NOT exist as a React Native `View` prop in
 * react-native 0.81.5 (verified by grep over react-native,
 * react-native-gesture-handler and react-native-screens) — a native view is the
 * only supported route, and with Fabric enabled (app.json `newArchEnabled`)
 * reaching the native View by hand through UIManager is not viable either.
 *
 * Known and accepted limitation (ESPECIFICACAO.md §6.4): Android honours only
 * ~200dp of exclusion height per edge and ignores the excess, so the lower part
 * of the left margin remains claimable by the system gesture. The rect is
 * clamped accordingly by [GestureExclusionRects.forView] — asking for more is
 * silently dropped, not additive.
 *
 * API < 29 (Android 10) has no such API: the call is skipped, no crash.
 */
class SystemGestureExclusionView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext) {

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        applyExclusion(w, h)
    }

    private fun applyExclusion(w: Int, h: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val rect = GestureExclusionRects.forView(w, h, resources.displayMetrics.density)
        systemGestureExclusionRects =
            if (rect == null) emptyList()
            else listOf(Rect(rect.left, rect.top, rect.right, rect.bottom))
    }
}
