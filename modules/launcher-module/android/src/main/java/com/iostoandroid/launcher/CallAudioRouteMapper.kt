package com.iostoandroid.launcher

/**
 * Pure-JVM mapping between the JS-facing audio route names (#920) and the
 * `android.telecom.CallAudioState.ROUTE_*` int flags. Kept free of android.*
 * imports so it can be unit-tested without a device — the four values below
 * are copied from CallAudioState's public API, which has been stable since
 * API 23, rather than referencing the class directly.
 */
object CallAudioRouteMapper {
    const val ROUTE_EARPIECE = 0x00000001
    const val ROUTE_BLUETOOTH = 0x00000002
    const val ROUTE_WIRED_HEADSET = 0x00000004
    const val ROUTE_SPEAKER = 0x00000008

    /** JS route name -> CallAudioState.ROUTE_* int, or null when unrecognized. */
    fun fromName(name: String): Int? = when (name) {
        "earpiece" -> ROUTE_EARPIECE
        "bluetooth" -> ROUTE_BLUETOOTH
        "wired_headset" -> ROUTE_WIRED_HEADSET
        "speaker" -> ROUTE_SPEAKER
        else -> null
    }

    /** CallAudioState.ROUTE_* int -> JS route name. Unknown/combined masks map to "unknown". */
    fun toName(route: Int): String = when (route) {
        ROUTE_EARPIECE -> "earpiece"
        ROUTE_BLUETOOTH -> "bluetooth"
        ROUTE_WIRED_HEADSET -> "wired_headset"
        ROUTE_SPEAKER -> "speaker"
        else -> "unknown"
    }
}
