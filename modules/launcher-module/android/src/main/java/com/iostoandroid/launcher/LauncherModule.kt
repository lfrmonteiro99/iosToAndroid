package com.iostoandroid.launcher

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.telephony.TelephonyManager
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class LauncherModule : Module() {
    companion object {
        var flashlightState = false
    }

    private val context: Context
        get() = appContext.reactContext ?: throw Exception("React context is not available")

    override fun definition() = ModuleDefinition {
        Name("LauncherModule")

        // ── Apps ─────────────────────────────────────────────────────────

        AsyncFunction("getInstalledApps") {
            val pm = context.packageManager
            val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            val activities = pm.queryIntentActivities(mainIntent, 0)

            activities.map { resolveInfo ->
                val appInfo = resolveInfo.activityInfo.applicationInfo
                val label = resolveInfo.loadLabel(pm).toString()
                val packageName = resolveInfo.activityInfo.packageName
                val icon = try {
                    drawableToBase64(resolveInfo.loadIcon(pm))
                } catch (e: Exception) { "" }
                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0

                mapOf(
                    "name" to label,
                    "packageName" to packageName,
                    "icon" to icon,
                    "isSystem" to isSystem
                )
            }.sortedBy { (it["name"] as String).lowercase() }
        }

        AsyncFunction("launchApp") { packageName: String ->
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } else { false }
        }

        AsyncFunction("getAppIcon") { packageName: String ->
            try {
                val pm = context.packageManager
                val icon = pm.getApplicationIcon(packageName)
                drawableToBase64(icon)
            } catch (e: Exception) { "" }
        }

        AsyncFunction("isDefaultLauncher") {
            val pm = context.packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
            val resolveInfo = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            resolveInfo?.activityInfo?.packageName == context.packageName
        }

        AsyncFunction("uninstallApp") { packageName: String ->
            try {
                val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("openLauncherSettings") {
            val intent = Intent(Settings.ACTION_HOME_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        // ── Wi-Fi ────────────────────────────────────────────────────────

        AsyncFunction("getWifiInfo") {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val info = wifiManager.connectionInfo
            mapOf(
                "enabled" to wifiManager.isWifiEnabled,
                "ssid" to (info?.ssid?.replace("\"", "") ?: "Unknown"),
                "rssi" to (info?.rssi ?: 0),
                "linkSpeed" to (info?.linkSpeed ?: 0),
                "ip" to intToIp(info?.ipAddress ?: 0)
            )
        }

        AsyncFunction("setWifiEnabled") { enabled: Boolean ->
            // Try direct toggle (works pre-Android 10 with CHANGE_WIFI_STATE permission).
            // Android 10+ restricts direct toggling for non-system apps, so we fall back
            // to the inline Settings Panel (not the full Settings app) — the panel overlays
            // our activity and returns focus when dismissed.
            try {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    @Suppress("DEPRECATION")
                    wifiManager.isWifiEnabled = enabled
                    true
                } else {
                    val intent = Intent(Settings.Panel.ACTION_WIFI)
                    appContext.currentActivity?.startActivity(intent)
                    true
                }
            } catch (e: Exception) { false }
        }

        AsyncFunction("joinWifiNetwork") { ssid: String, password: String, security: String ->
            // Silently add a Wi-Fi network using WifiNetworkSuggestion API (Android 10+)
            // or legacy WifiConfiguration (pre-10). The user is NOT sent to Settings.
            try {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val builder = android.net.wifi.WifiNetworkSuggestion.Builder().setSsid(ssid)
                    when (security.uppercase()) {
                        "WPA2", "WPA" -> builder.setWpa2Passphrase(password)
                        "WPA3" -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                builder.setWpa3Passphrase(password)
                            } else {
                                builder.setWpa2Passphrase(password)
                            }
                        }
                        else -> { /* open network — no passphrase */ }
                    }
                    val suggestion = builder.build()
                    val status = wifiManager.addNetworkSuggestions(listOf(suggestion))
                    status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
                } else {
                    @Suppress("DEPRECATION")
                    val config = android.net.wifi.WifiConfiguration().apply {
                        SSID = "\"$ssid\""
                        if (password.isNotEmpty()) {
                            preSharedKey = "\"$password\""
                        } else {
                            allowedKeyManagement.set(android.net.wifi.WifiConfiguration.KeyMgmt.NONE)
                        }
                    }
                    @Suppress("DEPRECATION")
                    val netId = wifiManager.addNetwork(config)
                    if (netId != -1) {
                        @Suppress("DEPRECATION")
                        wifiManager.enableNetwork(netId, true)
                        true
                    } else { false }
                }
            } catch (e: Exception) { false }
        }

        AsyncFunction("forgetWifiNetwork") { ssid: String ->
            try {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val current = wifiManager.networkSuggestions
                    val toRemove = current.filter { it.ssid == ssid }
                    if (toRemove.isNotEmpty()) {
                        val status = wifiManager.removeNetworkSuggestions(toRemove)
                        status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
                    } else { false }
                } else {
                    @Suppress("DEPRECATION")
                    val configured = wifiManager.configuredNetworks
                    val target = configured?.find { it.SSID == "\"$ssid\"" }
                    if (target != null) {
                        @Suppress("DEPRECATION")
                        wifiManager.removeNetwork(target.networkId)
                        true
                    } else { false }
                }
            } catch (e: Exception) { false }
        }

        AsyncFunction("getWifiNetworks") {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val results = wifiManager.scanResults ?: emptyList()
            results.take(20).map { result ->
                mapOf(
                    "ssid" to result.SSID,
                    "bssid" to result.BSSID,
                    "level" to result.level,
                    "frequency" to result.frequency,
                    "isSecure" to (result.capabilities.contains("WPA") || result.capabilities.contains("WEP"))
                )
            }.filter { (it["ssid"] as String).isNotEmpty() }
                .distinctBy { it["ssid"] }
        }

        // ── Bluetooth ────────────────────────────────────────────────────

        AsyncFunction("getBluetoothInfo") {
            val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = btManager?.adapter
            mapOf(
                "enabled" to (adapter?.isEnabled ?: false),
                "name" to (adapter?.name ?: "Unknown"),
                "address" to (adapter?.address ?: ""),
                "pairedDevices" to (try {
                    adapter?.bondedDevices?.map { device ->
                        mapOf(
                            "name" to (device.name ?: "Unknown"),
                            "address" to device.address,
                            "type" to device.type
                        )
                    } ?: emptyList()
                } catch (e: SecurityException) { emptyList<Map<String, Any>>() })
            )
        }

        AsyncFunction("setBluetoothEnabled") { enabled: Boolean ->
            // Attempt direct toggle via BluetoothAdapter. Requires BLUETOOTH_CONNECT permission
            // on Android 12+. If direct toggle fails (Android 13+ blocks it), fall back to
            // Settings Panel inline overlay (no full Settings app).
            try {
                val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = btManager?.adapter
                if (adapter != null && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    @Suppress("DEPRECATION")
                    val ok = if (enabled) adapter.enable() else adapter.disable()
                    if (ok) return@AsyncFunction true
                }
                // Fallback: inline panel overlay
                val panelIntent = Intent("android.settings.panel.action.BLUETOOTH")
                appContext.currentActivity?.startActivity(panelIntent)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("startBluetoothDiscovery") {
            // Start discovering nearby Bluetooth devices. Results come via
            // getDiscoveredBluetoothDevices(). No UI is shown to the user.
            try {
                val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = btManager?.adapter
                if (adapter == null || !adapter.isEnabled) return@AsyncFunction false
                BluetoothDiscoveryReceiver.register(context)
                if (adapter.isDiscovering) {
                    adapter.cancelDiscovery()
                }
                adapter.startDiscovery()
            } catch (e: Exception) { false }
        }

        AsyncFunction("stopBluetoothDiscovery") {
            try {
                val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = btManager?.adapter
                adapter?.cancelDiscovery()
                BluetoothDiscoveryReceiver.unregister(context)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("getDiscoveredBluetoothDevices") {
            BluetoothDiscoveryReceiver.getDiscoveredDevices()
        }

        AsyncFunction("pairBluetoothDevice") { address: String ->
            // Initiate pairing silently via BluetoothDevice.createBond().
            // Android will show a PIN confirmation dialog if the device requires it
            // — this is a security requirement that cannot be bypassed.
            try {
                val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = btManager?.adapter ?: return@AsyncFunction false
                val device = adapter.getRemoteDevice(address)
                device.createBond()
            } catch (e: Exception) { false }
        }

        AsyncFunction("unpairBluetoothDevice") { address: String ->
            try {
                val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = btManager?.adapter ?: return@AsyncFunction false
                val device = adapter.getRemoteDevice(address)
                // removeBond is hidden API; call via reflection
                val method = device.javaClass.getMethod("removeBond")
                method.invoke(device) as? Boolean ?: false
            } catch (e: Exception) { false }
        }

        // ── Storage ──────────────────────────────────────────────────────

        AsyncFunction("getStorageInfo") {
            val stat = StatFs(Environment.getDataDirectory().path)
            val totalBytes = stat.totalBytes
            val freeBytes = stat.freeBytes
            val usedBytes = totalBytes - freeBytes

            mapOf(
                "totalBytes" to totalBytes,
                "freeBytes" to freeBytes,
                "usedBytes" to usedBytes,
                "totalGB" to String.format("%.1f", totalBytes / 1073741824.0),
                "freeGB" to String.format("%.1f", freeBytes / 1073741824.0),
                "usedGB" to String.format("%.1f", usedBytes / 1073741824.0),
                "usedPercentage" to (usedBytes.toDouble() / totalBytes.toDouble() * 100).toInt()
            )
        }

        // ── SMS / Messages ───────────────────────────────────────────────

        AsyncFunction("getRecentMessages") { limit: Int ->
            try {
                val cursor: Cursor? = context.contentResolver.query(
                    Telephony.Sms.CONTENT_URI,
                    arrayOf(
                        Telephony.Sms._ID,
                        Telephony.Sms.ADDRESS,
                        Telephony.Sms.BODY,
                        Telephony.Sms.DATE,
                        Telephony.Sms.TYPE,
                        Telephony.Sms.READ
                    ),
                    null, null,
                    "${Telephony.Sms.DATE} DESC"
                )

                val messages = mutableListOf<Map<String, Any?>>()
                cursor?.use {
                    var count = 0
                    while (it.moveToNext() && count < limit) {
                        val date = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
                        messages.add(mapOf(
                            "id" to it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID)).toString(),
                            "address" to it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)),
                            "body" to it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)),
                            "date" to date,
                            "dateFormatted" to SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(date)),
                            "type" to it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.TYPE)),
                            "isRead" to (it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.READ)) == 1)
                        ))
                        count++
                    }
                }
                messages
            } catch (e: Exception) {
                emptyList<Map<String, Any?>>()
            }
        }

        // ── System Settings Panels ───────────────────────────────────────

        AsyncFunction("openSystemSettings") { panel: String ->
            val action = when (panel) {
                "wifi" -> Settings.ACTION_WIFI_SETTINGS
                "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
                "airplane" -> Settings.ACTION_AIRPLANE_MODE_SETTINGS
                "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
                "sound" -> Settings.ACTION_SOUND_SETTINGS
                "display" -> Settings.ACTION_DISPLAY_SETTINGS
                "battery" -> Intent.ACTION_POWER_USAGE_SUMMARY
                "storage" -> Settings.ACTION_INTERNAL_STORAGE_SETTINGS
                "date" -> Settings.ACTION_DATE_SETTINGS
                "keyboard" -> Settings.ACTION_INPUT_METHOD_SETTINGS
                "language" -> Settings.ACTION_LOCALE_SETTINGS
                "vpn" -> Settings.ACTION_VPN_SETTINGS
                "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
                "notification" -> Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
                "privacy" -> Settings.ACTION_PRIVACY_SETTINGS
                "security" -> Settings.ACTION_SECURITY_SETTINGS
                "cast" -> "android.settings.CAST_SETTINGS"
                "hotspot" -> "android.settings.TETHER_SETTINGS"
                "cellular" -> Settings.ACTION_NETWORK_OPERATOR_SETTINGS
                "data_roaming" -> Settings.ACTION_DATA_ROAMING_SETTINGS
                "appinfo" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                else -> Settings.ACTION_SETTINGS
            }
            try {
                val intent = if (panel == "appinfo") {
                    Intent(action, Uri.parse("package:${context.packageName}"))
                } else {
                    Intent(action)
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } catch (e: Exception) { false }
        }

        // ── Volume ───────────────────────────────────────────────────────

        AsyncFunction("getVolume") {
            try {
                val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val current = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                if (max > 0) current.toDouble() / max.toDouble() else 0.0
            } catch (e: Exception) { 0.5 }
        }

        AsyncFunction("setVolume") { level: Double ->
            try {
                val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                val target = (level.coerceIn(0.0, 1.0) * max).toInt()
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
                true
            } catch (e: Exception) { false }
        }

        // ── Network Info ─────────────────────────────────────────────────

        AsyncFunction("getNetworkInfo") {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork
            val capabilities = network?.let { cm.getNetworkCapabilities(it) }
            mapOf(
                "isConnected" to (capabilities != null),
                "isWifi" to (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ?: false),
                "isCellular" to (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ?: false),
                "isVpn" to (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ?: false)
            )
        }

        // ── Carrier Info ─────────────────────────────────────────────────

        AsyncFunction("getCarrierInfo") {
            try {
                val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                mapOf(
                    "carrierName" to (telephonyManager.networkOperatorName ?: ""),
                    "networkType" to getNetworkTypeString(telephonyManager),
                    "signalStrength" to getSignalLevel(),
                    "isRoaming" to telephonyManager.isNetworkRoaming,
                    "phoneNumber" to (try { telephonyManager.line1Number ?: "" } catch (e: SecurityException) { "" }),
                    "simOperator" to (telephonyManager.simOperatorName ?: "")
                )
            } catch (e: Exception) {
                mapOf(
                    "carrierName" to "",
                    "networkType" to "Unknown",
                    "signalStrength" to 0,
                    "isRoaming" to false,
                    "phoneNumber" to "",
                    "simOperator" to ""
                )
            }
        }

        // ── App Storage Stats ────────────────────────────────────────────

        AsyncFunction("getAppStorageStats") {
            try {
                val pm = context.packageManager
                val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                val activities = pm.queryIntentActivities(mainIntent, 0)

                val appStats = activities.map { resolveInfo ->
                    val packageName = resolveInfo.activityInfo.packageName
                    val appName = resolveInfo.loadLabel(pm).toString()
                    val appInfo = try { pm.getApplicationInfo(packageName, 0) } catch (e: Exception) { null }
                    val sourceDir = appInfo?.sourceDir
                    val totalBytes = if (sourceDir != null) {
                        try { java.io.File(sourceDir).length() } catch (e: Exception) { 0L }
                    } else { 0L }

                    // Try to get cache size
                    val cacheBytes = try {
                        val cacheDir = context.createPackageContext(packageName, 0).cacheDir
                        dirSize(cacheDir)
                    } catch (e: Exception) { 0L }

                    mapOf(
                        "packageName" to packageName,
                        "appName" to appName,
                        "totalBytes" to totalBytes,
                        "cacheBytes" to cacheBytes
                    )
                }
                    .sortedByDescending { it["totalBytes"] as Long }
                    .take(20)

                appStats
            } catch (e: Exception) {
                emptyList<Map<String, Any>>()
            }
        }

        // ── Flashlight ───────────────────────────────────────────────────

        AsyncFunction("setFlashlight") { enabled: Boolean ->
            try {
                val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                val cameraId = cameraManager.cameraIdList[0]
                cameraManager.setTorchMode(cameraId, enabled)
                flashlightState = enabled
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("isFlashlightOn") {
            // No direct API to check; track state in companion object
            flashlightState
        }

        // ── Call Log ─────────────────────────────────────────────────────

        AsyncFunction("getCallLog") { limit: Int ->
            try {
                val cursor: Cursor? = context.contentResolver.query(
                    CallLog.Calls.CONTENT_URI,
                    arrayOf(
                        CallLog.Calls._ID,
                        CallLog.Calls.NUMBER,
                        CallLog.Calls.CACHED_NAME,
                        CallLog.Calls.TYPE,
                        CallLog.Calls.DATE,
                        CallLog.Calls.DURATION
                    ),
                    null, null,
                    "${CallLog.Calls.DATE} DESC"
                )

                val calls = mutableListOf<Map<String, Any?>>()
                cursor?.use { c ->
                    var count = 0
                    while (c.moveToNext() && count < limit) {
                        val number = c.getString(c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: ""
                        val cachedName = c.getString(c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME))
                        val callType = c.getInt(c.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                        val date = c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DATE))
                        val duration = c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DURATION))

                        // Resolve contact name if not cached
                        val name = cachedName ?: resolveContactName(number)

                        val typeStr = when (callType) {
                            CallLog.Calls.INCOMING_TYPE -> "incoming"
                            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                            CallLog.Calls.MISSED_TYPE -> "missed"
                            CallLog.Calls.REJECTED_TYPE -> "rejected"
                            else -> "unknown"
                        }

                        calls.add(mapOf(
                            "id" to c.getLong(c.getColumnIndexOrThrow(CallLog.Calls._ID)).toString(),
                            "number" to number,
                            "name" to (name ?: ""),
                            "type" to typeStr,
                            "date" to date,
                            "dateFormatted" to SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(date)),
                            "duration" to duration
                        ))
                        count++
                    }
                }
                calls
            } catch (e: Exception) {
                emptyList<Map<String, Any?>>()
            }
        }

        // ── Make Call (via TelecomManager) ────────────────────────────────

        AsyncFunction("makeCall") { number: String ->
            try {
                val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } catch (e: Exception) { false }
        }

        // ── Notifications ────────────────────────────────────────────────

        AsyncFunction("getNotifications") {
            NotificationService.getNotificationMaps()
        }

        AsyncFunction("isNotificationAccessGranted") {
            val cn = android.content.ComponentName(context, NotificationService::class.java)
            val flat = android.provider.Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            )
            flat != null && flat.contains(cn.flattenToString())
        }

        AsyncFunction("clearNotification") { key: String ->
            NotificationService.dismissNotification(key)
        }

        AsyncFunction("clearAllNotifications") {
            NotificationService.dismissAllNotifications()
        }

        AsyncFunction("openNotificationAccessSettings") {
            val intent = android.content.Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        // ── SMS Send ─────────────────────────────────────────────────────

        AsyncFunction("sendSms") { address: String, body: String ->
            try {
                val smsManager = android.telephony.SmsManager.getDefault()
                smsManager.sendTextMessage(address, null, body, null, null)
                true
            } catch (e: Exception) {
                false
            }
        }

        // ── Calendar ─────────────────────────────────────────────────────

        AsyncFunction("getCalendarEvents") { daysAhead: Int ->
            try {
                val now = System.currentTimeMillis()
                val end = now + (daysAhead.toLong() * 24 * 60 * 60 * 1000)
                val cursor = context.contentResolver.query(
                    android.provider.CalendarContract.Events.CONTENT_URI,
                    arrayOf(
                        android.provider.CalendarContract.Events._ID,
                        android.provider.CalendarContract.Events.TITLE,
                        android.provider.CalendarContract.Events.DTSTART,
                        android.provider.CalendarContract.Events.DTEND,
                        android.provider.CalendarContract.Events.ALL_DAY,
                        android.provider.CalendarContract.Events.EVENT_LOCATION
                    ),
                    "${android.provider.CalendarContract.Events.DTSTART} >= ? AND ${android.provider.CalendarContract.Events.DTSTART} <= ?",
                    arrayOf(now.toString(), end.toString()),
                    "${android.provider.CalendarContract.Events.DTSTART} ASC"
                )
                val events = mutableListOf<Map<String, Any?>>()
                cursor?.use { c ->
                    while (c.moveToNext() && events.size < 20) {
                        events.add(mapOf(
                            "id" to c.getLong(0).toString(),
                            "title" to (c.getString(1) ?: ""),
                            "start" to c.getLong(2),
                            "end" to c.getLong(3),
                            "allDay" to (c.getInt(4) == 1),
                            "location" to (c.getString(5) ?: "")
                        ))
                    }
                }
                events
            } catch (e: Exception) {
                emptyList<Map<String, Any?>>()
            }
        }

        // ── Media Session (Now Playing) ───────────────────────────────────

        AsyncFunction("getNowPlaying") {
            try {
                val mediaSessionManager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? android.media.session.MediaSessionManager
                val controllers = mediaSessionManager?.getActiveSessions(
                    android.content.ComponentName(context, NotificationService::class.java)
                ) ?: emptyList()

                if (controllers.isNotEmpty()) {
                    val controller = controllers[0]
                    val metadata = controller.metadata
                    val state = controller.playbackState
                    mapOf(
                        "title" to (metadata?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE) ?: ""),
                        "artist" to (metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST) ?: ""),
                        "album" to (metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM) ?: ""),
                        "isPlaying" to (state?.state == android.media.session.PlaybackState.STATE_PLAYING),
                        "packageName" to (controller.packageName ?: "")
                    )
                } else {
                    mapOf("title" to "", "artist" to "", "album" to "", "isPlaying" to false, "packageName" to "")
                }
            } catch (e: Exception) {
                mapOf("title" to "", "artist" to "", "album" to "", "isPlaying" to false, "packageName" to "")
            }
        }

        // ── Media Transport Controls ─────────────────────────────────────

        AsyncFunction("mediaPrev") {
            try {
                val mediaSessionManager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? android.media.session.MediaSessionManager
                val controllers = mediaSessionManager?.getActiveSessions(
                    android.content.ComponentName(context, NotificationService::class.java)
                ) ?: emptyList()
                if (controllers.isNotEmpty()) {
                    controllers[0].transportControls.skipToPrevious()
                    true
                } else false
            } catch (e: Exception) { false }
        }

        AsyncFunction("mediaPlayPause") {
            try {
                val mediaSessionManager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? android.media.session.MediaSessionManager
                val controllers = mediaSessionManager?.getActiveSessions(
                    android.content.ComponentName(context, NotificationService::class.java)
                ) ?: emptyList()
                if (controllers.isNotEmpty()) {
                    val controller = controllers[0]
                    val state = controller.playbackState
                    if (state?.state == android.media.session.PlaybackState.STATE_PLAYING) {
                        controller.transportControls.pause()
                    } else {
                        controller.transportControls.play()
                    }
                    true
                } else false
            } catch (e: Exception) { false }
        }

        AsyncFunction("mediaNext") {
            try {
                val mediaSessionManager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? android.media.session.MediaSessionManager
                val controllers = mediaSessionManager?.getActiveSessions(
                    android.content.ComponentName(context, NotificationService::class.java)
                ) ?: emptyList()
                if (controllers.isNotEmpty()) {
                    controllers[0].transportControls.skipToNext()
                    true
                } else false
            } catch (e: Exception) { false }
        }

        // ── Screen Time / Usage Stats ────────────────────────────────────

        AsyncFunction("isUsageAccessGranted") {
            try {
                val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
                val mode = appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    context.packageName
                )
                mode == AppOpsManager.MODE_ALLOWED
            } catch (e: Exception) { false }
        }

        AsyncFunction("openUsageAccessSettings") {
            try {
                val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("getScreenTimeStats") { daysBack: Int ->
            try {
                val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
                val pm = context.packageManager
                val cal = Calendar.getInstance()
                val endTime = cal.timeInMillis
                cal.add(Calendar.DAY_OF_YEAR, -daysBack)
                val startTime = cal.timeInMillis

                val stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY,
                    startTime,
                    endTime
                )

                val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

                stats?.filter { it.totalTimeInForeground > 0 }
                    ?.map { stat ->
                        val appName = try {
                            val appInfo = pm.getApplicationInfo(stat.packageName, 0)
                            pm.getApplicationLabel(appInfo).toString()
                        } catch (e: Exception) { stat.packageName }

                        mapOf(
                            "packageName" to stat.packageName,
                            "totalTimeMs" to stat.totalTimeInForeground,
                            "appName" to appName,
                            "date" to dateFormat.format(Date(stat.lastTimeUsed))
                        )
                    }
                    ?.sortedByDescending { it["totalTimeMs"] as Long }
                    ?: emptyList()
            } catch (e: Exception) {
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("getTodayScreenTime") {
            try {
                val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
                val pm = context.packageManager
                val cal = Calendar.getInstance()
                val endTime = cal.timeInMillis
                // Start of today
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val startTime = cal.timeInMillis

                val stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY,
                    startTime,
                    endTime
                )

                val usedApps = stats?.filter { it.totalTimeInForeground > 60000 } // >1 min
                    ?.sortedByDescending { it.totalTimeInForeground }
                    ?: emptyList()

                val totalMs = usedApps.sumOf { it.totalTimeInForeground }
                val totalMinutes = (totalMs / 60000).toInt()

                val topApps = usedApps.take(10).map { stat ->
                    val appName = try {
                        val appInfo = pm.getApplicationInfo(stat.packageName, 0)
                        pm.getApplicationLabel(appInfo).toString()
                    } catch (e: Exception) { stat.packageName }

                    mapOf(
                        "name" to appName,
                        "packageName" to stat.packageName,
                        "minutes" to (stat.totalTimeInForeground / 60000).toInt()
                    )
                }

                mapOf(
                    "totalMinutes" to totalMinutes,
                    "topApps" to topApps
                )
            } catch (e: Exception) {
                mapOf(
                    "totalMinutes" to 0,
                    "topApps" to emptyList<Map<String, Any>>()
                )
            }
        }

        // ── Permissions ──────────────────────────────────────────────────

        AsyncFunction("requestAllPermissions") {
            val activity = appContext.currentActivity ?: throw Exception("No activity")
            val permissions = mutableListOf(
                android.Manifest.permission.READ_CONTACTS,
                android.Manifest.permission.READ_CALL_LOG,
                android.Manifest.permission.CALL_PHONE,
                android.Manifest.permission.READ_SMS,
                android.Manifest.permission.SEND_SMS,
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.READ_CALENDAR
            )
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                permissions.add(android.Manifest.permission.BLUETOOTH_CONNECT)
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                permissions.add(android.Manifest.permission.POST_NOTIFICATIONS)
            }
            val REQUEST_CODE = 1001
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                activity.requestPermissions(permissions.toTypedArray(), REQUEST_CODE)
            }
            true
        }

        AsyncFunction("checkPermissions") {
            val perms = mutableMapOf(
                "contacts" to hasPermission(android.Manifest.permission.READ_CONTACTS),
                "callLog" to hasPermission(android.Manifest.permission.READ_CALL_LOG),
                "phone" to hasPermission(android.Manifest.permission.CALL_PHONE),
                "sms" to hasPermission(android.Manifest.permission.READ_SMS),
                "sendSms" to hasPermission(android.Manifest.permission.SEND_SMS),
                "camera" to hasPermission(android.Manifest.permission.CAMERA),
                "location" to hasPermission(android.Manifest.permission.ACCESS_FINE_LOCATION),
                "calendar" to hasPermission(android.Manifest.permission.READ_CALENDAR)
            )
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                perms["bluetooth"] = hasPermission(android.Manifest.permission.BLUETOOTH_CONNECT)
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                perms["notifications"] = hasPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            }
            perms
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private fun hasPermission(permission: String): Boolean {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            context, permission
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun resolveContactName(phoneNumber: String): String? {
        try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val cursor = context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )
            cursor?.use { c ->
                if (c.moveToFirst()) {
                    return c.getString(0)
                }
            }
        } catch (_: Exception) {}
        return null
    }

    private fun intToIp(ip: Int): String {
        return "${ip and 0xFF}.${ip shr 8 and 0xFF}.${ip shr 16 and 0xFF}.${ip shr 24 and 0xFF}"
    }

    private fun drawableToBase64(drawable: Drawable): String {
        val bitmap = drawableToBitmap(drawable)
        val scaledBitmap = Bitmap.createScaledBitmap(bitmap, 128, 128, true)
        val outputStream = ByteArrayOutputStream()
        scaledBitmap.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
        val bytes = outputStream.toByteArray()
        if (bitmap != scaledBitmap) scaledBitmap.recycle()
        return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return drawable.bitmap
        }
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 128
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 128
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    @Suppress("DEPRECATION")
    private fun getNetworkTypeString(telephonyManager: TelephonyManager): String {
        val networkType = try {
            telephonyManager.dataNetworkType
        } catch (e: SecurityException) {
            TelephonyManager.NETWORK_TYPE_UNKNOWN
        }
        return when (networkType) {
            TelephonyManager.NETWORK_TYPE_NR -> "5G"
            TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
            TelephonyManager.NETWORK_TYPE_HSPAP,
            TelephonyManager.NETWORK_TYPE_HSPA,
            TelephonyManager.NETWORK_TYPE_HSDPA,
            TelephonyManager.NETWORK_TYPE_HSUPA -> "HSPA+"
            TelephonyManager.NETWORK_TYPE_UMTS,
            TelephonyManager.NETWORK_TYPE_EVDO_0,
            TelephonyManager.NETWORK_TYPE_EVDO_A,
            TelephonyManager.NETWORK_TYPE_EVDO_B -> "3G"
            TelephonyManager.NETWORK_TYPE_EDGE,
            TelephonyManager.NETWORK_TYPE_GPRS -> "2G"
            TelephonyManager.NETWORK_TYPE_CDMA,
            TelephonyManager.NETWORK_TYPE_1xRTT -> "2G"
            else -> "Unknown"
        }
    }

    private fun getSignalLevel(): Int {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                telephonyManager.signalStrength?.level ?: 0
            } else {
                2 // Default mid-level for older APIs
            }
        } catch (e: Exception) { 0 }
    }

    private fun dirSize(dir: java.io.File?): Long {
        if (dir == null || !dir.exists()) return 0L
        var size = 0L
        val files = dir.listFiles() ?: return 0L
        for (file in files) {
            size += if (file.isDirectory) dirSize(file) else file.length()
        }
        return size
    }
}
