package com.iostoandroid.launcher

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import java.util.concurrent.ConcurrentHashMap

/**
 * Receives Bluetooth discovery broadcasts and maintains a list of found devices.
 * Used by LauncherModule to expose in-app Bluetooth scanning without showing
 * Android's Settings UI.
 */
class BluetoothDiscoveryReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent?.action == BluetoothDevice.ACTION_FOUND) {
            val device: BluetoothDevice? = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
            val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
            if (device != null) {
                val name = try { device.name } catch (_: SecurityException) { null }
                discovered[device.address] = mapOf(
                    "name" to (name ?: "Unknown"),
                    "address" to device.address,
                    "type" to device.type,
                    "rssi" to rssi,
                    "bondState" to device.bondState
                )
            }
        }
    }

    companion object {
        private val discovered = ConcurrentHashMap<String, Map<String, Any?>>()
        private var receiver: BluetoothDiscoveryReceiver? = null
        private var registeredContext: Context? = null

        fun register(context: Context) {
            if (receiver != null) return
            val r = BluetoothDiscoveryReceiver()
            val filter = IntentFilter(BluetoothDevice.ACTION_FOUND)
            try {
                context.applicationContext.registerReceiver(r, filter)
                receiver = r
                registeredContext = context.applicationContext
            } catch (_: Exception) { /* already registered or unsupported */ }
        }

        fun unregister(context: Context) {
            val r = receiver
            if (r != null) {
                try {
                    (registeredContext ?: context.applicationContext).unregisterReceiver(r)
                } catch (_: Exception) { /* not registered */ }
                receiver = null
                registeredContext = null
            }
        }

        fun getDiscoveredDevices(): List<Map<String, Any?>> {
            return discovered.values.toList()
        }

        fun clear() {
            discovered.clear()
        }
    }
}
