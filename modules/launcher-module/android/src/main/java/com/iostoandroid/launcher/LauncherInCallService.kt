package com.iostoandroid.launcher

import android.os.Bundle
import android.telecom.Call
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
 * Scope for #919 is deliberately narrow: forward call state so JS can react,
 * nothing more. Audio routing (mute/speaker/hold) and incoming calls are out
 * of scope (separate issues) — onCallAdded/onStateChanged still fire for a
 * ringing (incoming) call because Telecom does not let a bound InCallService
 * opt out of that, but no UI or answer/reject action is wired to it here, so
 * behaviour for incoming calls is unchanged by this file.
 */
class LauncherInCallService : InCallService() {

    private val callback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            emitState(call, state)
        }
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        call.registerCallback(callback)
        emitState(call, call.state)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        call.unregisterCallback(callback)
        LauncherModule.emitEvent("onCallEnded", Bundle())
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
