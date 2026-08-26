package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM unit tests for [CallAudioRouteMapper] — no android.* imports,
 * runs without a device or the Android SDK.
 */
class CallAudioRouteMapperTest {

    @Test
    fun `maps every known JS route name to its CallAudioState int`() {
        assertEquals(CallAudioRouteMapper.ROUTE_EARPIECE, CallAudioRouteMapper.fromName("earpiece"))
        assertEquals(CallAudioRouteMapper.ROUTE_BLUETOOTH, CallAudioRouteMapper.fromName("bluetooth"))
        assertEquals(CallAudioRouteMapper.ROUTE_WIRED_HEADSET, CallAudioRouteMapper.fromName("wired_headset"))
        assertEquals(CallAudioRouteMapper.ROUTE_SPEAKER, CallAudioRouteMapper.fromName("speaker"))
    }

    @Test
    fun `rejects unknown route names`() {
        assertNull(CallAudioRouteMapper.fromName(""))
        assertNull(CallAudioRouteMapper.fromName("Speaker"))
        assertNull(CallAudioRouteMapper.fromName("bluetooth_sco"))
    }

    @Test
    fun `round-trips every route int back to its JS name`() {
        assertEquals("earpiece", CallAudioRouteMapper.toName(CallAudioRouteMapper.ROUTE_EARPIECE))
        assertEquals("bluetooth", CallAudioRouteMapper.toName(CallAudioRouteMapper.ROUTE_BLUETOOTH))
        assertEquals("wired_headset", CallAudioRouteMapper.toName(CallAudioRouteMapper.ROUTE_WIRED_HEADSET))
        assertEquals("speaker", CallAudioRouteMapper.toName(CallAudioRouteMapper.ROUTE_SPEAKER))
    }

    @Test
    fun `maps unknown or combined route masks to the unknown fallback`() {
        assertEquals("unknown", CallAudioRouteMapper.toName(0))
        // ROUTE_WIRED_OR_EARPIECE (EARPIECE | WIRED_HEADSET) is a real CallAudioState
        // supportedRouteMask value but never a single active `route` — verifying it
        // is NOT silently accepted as "earpiece" guards against a `route and MASK`
        // bug creeping into toName later.
        assertEquals("unknown", CallAudioRouteMapper.toName(CallAudioRouteMapper.ROUTE_EARPIECE or CallAudioRouteMapper.ROUTE_WIRED_HEADSET))
    }
}
