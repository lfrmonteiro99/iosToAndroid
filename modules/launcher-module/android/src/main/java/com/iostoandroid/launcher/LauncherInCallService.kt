package com.iostoandroid.launcher

import android.os.Bundle
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService

/**
 * Registers this app as an in-call UI provider once it is selected as the
 * system's default dialer (RoleManager on API 29+, ACTION_CHANGE_DEFAULT_DIALER
 * below — see LauncherModule.requestDefaultDialer, #919).
 *
 * Without an InCallService, becoming the default dialer role alone does not
 * stop a previously installed dialer app's own InCallService from being the
 * one Telecom hands calls to for its UI — this is the piece that actually
 * makes CallScreen (src/screens/CallScreen.tsx) the call UI that stays on top
 * for the lifetime of the call, instead of disappearing under the installed
 * dialer's screen once Telecom takes over (the symptom in the issue).
 *
 * Scope for #919 was deliberately narrow: forward call state so JS can react,
 * nothing more. #921 (incoming calls, passo 6 de #378) builds on top of that:
 * [currentCall] keeps the ringing/active Call reference so JS's Accept/Decline
 * actions (LauncherModule.answerCall/rejectCall) have something to act on —
 * Telecom hands calls to this service regardless of what CallScreen shows,
 * so answer/reject here is the only way to actually affect the call.
 * #920 adds the audio-routing half: onCallAudioStateChanged forwards
 * mic-mute + route so JS can reflect real state, and setMuted/setAudioRoute
 * (below) let JS command it back — both routed through the static [instance]
 * reference since only Telecom (not JS) constructs this service.
 */
class LauncherInCallService : InCallService() {

    companion object {
        @Volatile private var currentCall: Call? = null

        /** True (call answered) when there is a call to answer; false otherwise. */
        fun answerCurrentCall(): Boolean {
            val call = currentCall ?: return false
            return try {
                call.answer(0) // VideoProfile.STATE_AUDIO_ONLY
                true
            } catch (e: Exception) {
                false
            }
        }

        /**
         * Rejects the current call. [message], when non-empty, sends the Telecom
         * "reject with message" SMS variant — Call.reject already takes that
         * pair of arguments, so this is a direct, cheap pass-through rather than
         * a separate feature.
         */
        fun rejectCurrentCall(message: String?): Boolean {
            val call = currentCall ?: return false
            return try {
                call.reject(!message.isNullOrEmpty(), message)
                true
            } catch (e: Exception) {
                false
            }
        }

        // Set in onCreate/cleared in onDestroy — Telecom owns this service's
        // lifecycle, so this is the only way LauncherModule's setMuted/
        // setAudioRoute AsyncFunctions can reach the live instance. Null
        // (no bound InCallService, i.e. this app is not the current default
        // dialer) makes both request* functions safe no-ops.
        @Volatile private var instance: LauncherInCallService? = null

        /** True when a call was actually commanded; false when no InCallService is bound. */
        fun requestMuted(muted: Boolean): Boolean {
            val svc = instance ?: return false
            svc.setMuted(muted)
            return true
        }

        /** True when a call was actually commanded; false when no InCallService is bound. */
        fun requestAudioRoute(route: Int): Boolean {
            val svc = instance ?: return false
            svc.setAudioRoute(route)
            return true
        }
    }

    private val callback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            emitState(call, state)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        currentCall = call
        call.registerCallback(callback)
        emitState(call, call.state)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        if (currentCall === call) currentCall = null
        call.unregisterCallback(callback)
        LauncherModule.emitEvent("onCallEnded", Bundle())
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState) {
        super.onCallAudioStateChanged(audioState)
        val bundle = Bundle().apply {
            putBoolean("isMuted", audioState.isMuted)
            putString("route", CallAudioRouteMapper.toName(audioState.route))
        }
        LauncherModule.emitEvent("onCallAudioStateChanged", bundle)
    }

    private fun emitState(call: Call, state: Int) {
        val bundle = Bundle().apply {
            putString("state", stateName(state))
            putString("number", call.details?.handle?.schemeSpecificPart ?: "")
        }
        LauncherModule.emitEvent("onCallStateChanged", bundle)
    }

    private fun stateName(state: Int): String = when (state) {
        Call.STATE_NEW -> "new"
        Call.STATE_DIALING -> "dialing"
        Call.STATE_RINGING -> "ringing"
        Call.STATE_ACTIVE -> "active"
        Call.STATE_HOLDING -> "holding"
        Call.STATE_DISCONNECTED -> "disconnected"
        Call.STATE_CONNECTING -> "connecting"
        Call.STATE_DISCONNECTING -> "disconnecting"
        else -> "unknown"
    }
}
