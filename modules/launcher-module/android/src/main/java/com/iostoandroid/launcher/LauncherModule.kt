package com.iostoandroid.launcher

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
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
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Environment
import android.os.StatFs
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
            try {
                val intent = Intent(Settings.Panel.ACTION_WIFI)
                // Don't add FLAG_ACTIVITY_NEW_TASK — we want the panel to appear over our activity
                appContext.currentActivity?.startActivity(intent)
                true
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
            try {
                // Panel shows inline overlay, not full settings app
                val panelIntent = Intent("android.settings.panel.action.BLUETOOTH")
                appContext.currentActivity?.startActivity(panelIntent)
                true
            } catch (e: Exception) {
                // Fallback for older devices
                try {
                    val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    true
                } catch (e2: Exception) { false }
            }
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
                "hotspot" -> "android.settings.TETHER_SETTINGS"
                "cellular" -> Settings.ACTION_NETWORK_OPERATOR_SETTINGS
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

        // ── Permissions ──────────────────────────────────────────────────

        AsyncFunction("requestAllPermissions") {
            val activity = appContext.currentActivity ?: throw Exception("No activity")
            val permissions = arrayOf(
                android.Manifest.permission.READ_CONTACTS,
                android.Manifest.permission.READ_CALL_LOG,
                android.Manifest.permission.CALL_PHONE,
                android.Manifest.permission.READ_SMS,
                android.Manifest.permission.SEND_SMS,
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.READ_PHONE_STATE
            )
            val REQUEST_CODE = 1001
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                activity.requestPermissions(permissions, REQUEST_CODE)
            }
            true
        }

        AsyncFunction("checkPermissions") {
            val perms = mapOf(
                "contacts" to hasPermission(android.Manifest.permission.READ_CONTACTS),
                "callLog" to hasPermission(android.Manifest.permission.READ_CALL_LOG),
                "phone" to hasPermission(android.Manifest.permission.CALL_PHONE),
                "sms" to hasPermission(android.Manifest.permission.READ_SMS),
                "sendSms" to hasPermission(android.Manifest.permission.SEND_SMS),
                "camera" to hasPermission(android.Manifest.permission.CAMERA),
                "location" to hasPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
            )
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
}
