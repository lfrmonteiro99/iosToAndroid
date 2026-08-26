package com.iostoandroid.launcher

import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.PowerManager
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Process
import android.os.StatFs
import android.os.SystemClock
import android.telephony.TelephonyManager
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class LauncherModule : Module() {
    companion object {
        var flashlightState = false
        @Volatile private var instance: LauncherModule? = null
        @Volatile var activeRecognizer: SpeechRecognizer? = null

        // Live Activities (#626): one shared low-importance channel for every
        // ongoing notification posted via postLiveActivity.
        private const val LIVE_ACTIVITY_CHANNEL_ID = "live_activities"

        // #930: sendSms — how long to wait for the sentIntent broadcast(s)
        // before giving up and reporting an indeterminate (=failed) send.
        private const val SMS_SEND_TIMEOUT_MS = 30_000L
        private const val SMS_SENT_ACTION_PREFIX = "com.iostoandroid.launcher.SMS_SENT"
        private const val EXTRA_SMS_PART_INDEX = "smsPartIndex"

        // Monotonically increasing so two sends in flight at once (or the
        // user double-tapping Send) each get their own broadcast action and
        // PendingIntent request codes instead of colliding.
        private val smsSendRequestId = AtomicInteger(0)

        /**
         * Protected-app set pushed from JS (AppsStore) so the foreground monitor
         * can gate apps launched OUTSIDE the launcher (recent apps / share sheet /
         * deep link) — the JS gate in launchApp only covers in-launcher opens.
         * Read by ForegroundMonitorService on every foreground transition.
         */
        @Volatile var protectedApps: Set<String> = emptySet()

        /**
         * Called by [NotificationService] and by MainActivity.onNewIntent (#508, injected
         * by plugins/withLauncherIntent.js) to forward events to JavaScript.
         * Uses Expo's built-in event emitter — declared via Events(...) in the definition.
         */
        fun emitEvent(name: String, bundle: Bundle) {
            try {
                instance?.sendEvent(name, bundle)
            } catch (_: Throwable) {
                // AppContext may not be ready, or listeners may not be attached yet.
            }
        }
    }

    private val context: Context
        get() = appContext.reactContext ?: throw Exception("React context is not available")

    override fun definition() = ModuleDefinition {
        Name("LauncherModule")

        Events("onNotificationPosted", "onNotificationRemoved", "onHomePressed", "onPackageChanged", "onSpeechPartialResult", "onSpeechResult", "onSpeechError", "onBackTap", "onAppAccess", "onForegroundAppChanged", "onCallStateChanged", "onCallEnded", "onCallAudioStateChanged")

        // Native view that reserves its own bounds against the Android system
        // gesture (see SystemGestureExclusionView). Used by BackEdgeSwipe's
        // left-edge catcher; no props, geometry comes from layout.
        View(SystemGestureExclusionView::class) {}

        // Register this module instance so NotificationService can route events through it.
        instance = this@LauncherModule

        // ── Apps ─────────────────────────────────────────────────────────

        AsyncFunction("getInstalledApps") { maskArg: Map<String, Any?>?, treatmentArg: String? ->
            // #482: a forma da máscara vem de JS. #486: o tratamento (quem é
            // mascarado) também. Ambos entram na chave da cache
            // (IconCache.fileName), por isso mudar qualquer um deixa os PNGs
            // antigos órfãos e força um redesenho — sem passo extra.
            val mask = IconMaskSpec.from(maskArg)
            val treatment = treatmentArg ?: IconTreatment.DEFAULT
            val pm = context.packageManager
            val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            // queryIntentActivities returns one entry per launcher activity, not per
            // package: an app registering several (Google also registers "Voice Search")
            // would yield repeated packageNames. launchApp resolves a single activity per
            // package via getLaunchIntentForPackage, so the extra entries are not
            // separately launchable — keep the first activity of each package.
            val activities = pm.queryIntentActivities(mainIntent, 0)
                .distinctBy { it.activityInfo.packageName }

            // Icons are cached to disk as <packageName>_<versionCode>.png instead of
            // being re-extracted and base64-encoded on every launch — see IconCache
            // for the filename/orphan logic this AsyncFunction drives.
            val iconsDir = File(context.filesDir, "icons").apply { mkdirs() }
            val validIconFileNames = mutableSetOf<String>()

            val apps = activities.map { resolveInfo ->
                val appInfo = resolveInfo.activityInfo.applicationInfo
                val label = resolveInfo.loadLabel(pm).toString()
                val packageName = resolveInfo.activityInfo.packageName
                val icon = try {
                    val versionCode = getVersionCode(pm, packageName)
                    val fileName = IconCache.fileName(packageName, versionCode, mask.cacheKey, treatment)
                    validIconFileNames.add(fileName)
                    val iconFile = File(iconsDir, fileName)
                    if (!iconFile.exists()) {
                        writeIconToFile(resolveInfo.loadIcon(pm), iconFile, mask, treatment)
                    }
                    "file://" + iconFile.absolutePath
                } catch (e: Exception) { "" }
                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                // GUARDA DE API, e não é defensiva por hábito: `ApplicationInfo.category`
                // só existe a partir da API 26 e este módulo declara minSdkVersion 24
                // (modules/launcher-module/android/build.gradle:13). Em API 24/25 o
                // acesso ao campo lança NoSuchFieldError, o que rejeita a promise
                // inteira do getInstalledApps — AppsStore.tsx apanha, alerta
                // "Could not load apps", e o launcher fica sem uma única aplicação.
                // O resto deste ficheiro usa a mesma guarda 15 vezes.
                val category = if (CategoryMapper.isCategoryReadable(Build.VERSION.SDK_INT)) {
                    CategoryMapper.categoryToString(appInfo.category)
                } else {
                    CategoryMapper.UNDEFINED
                }

                mapOf(
                    "name" to label,
                    "packageName" to packageName,
                    "icon" to icon,
                    "isSystem" to isSystem,
                    "category" to category
                )
            }.sortedBy { (it["name"] as String).lowercase() }

            // Drop cached PNGs for apps that were uninstalled, or updated to a
            // versionCode whose icon was just (re-)cached under a new key above —
            // otherwise filesDir/icons grows without bound.
            val existingIconFileNames = iconsDir.list()?.toList() ?: emptyList()
            IconCache.orphanedFiles(existingIconFileNames, validIconFileNames).forEach { name ->
                try { File(iconsDir, name).delete() } catch (e: Exception) { /* best effort */ }
            }

            apps
        }

        AsyncFunction("getAppInfo") { packageName: String, maskArg: Map<String, Any?>?, treatmentArg: String? ->
            val mask = IconMaskSpec.from(maskArg)
            // Single-package equivalent of getInstalledApps: used to refresh only
            // the package a PACKAGE_* broadcast named (#485) instead of rescanning
            // every installed app. Returns null when the package is gone or has no
            // launcher activity, so JS can drop the event. Also the redraw step
            // rebuildIconCache() (#486) calls once per package after clearIconCache.
            val treatment = treatmentArg ?: IconTreatment.DEFAULT
            try {
                val pm = context.packageManager
                val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                    setPackage(packageName)
                }
                val resolveInfo = pm.queryIntentActivities(mainIntent, 0).firstOrNull()
                if (resolveInfo == null) {
                    null
                } else {
                    val appInfo = resolveInfo.activityInfo.applicationInfo
                    val iconsDir = File(context.filesDir, "icons").apply { mkdirs() }
                    val icon = try {
                        val fileName = IconCache.fileName(packageName, getVersionCode(pm, packageName), mask.cacheKey, treatment)
                        val iconFile = File(iconsDir, fileName)
                        if (!iconFile.exists()) {
                            writeIconToFile(resolveInfo.loadIcon(pm), iconFile, mask, treatment)
                        }
                        "file://" + iconFile.absolutePath
                    } catch (e: Exception) { "" }
                    mapOf(
                        "name" to resolveInfo.loadLabel(pm).toString(),
                        "packageName" to packageName,
                        "icon" to icon,
                        "isSystem" to ((appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                    )
                }
            } catch (e: Exception) { null }
        }

        AsyncFunction("launchApp") { packageName: String ->
            // Shape regex first, then whitelist via PackageManager: malformed names
            // never reach the resolver, and non-installed / non-launchable packages
            // resolve to null. See PackageNameValidator for the pure-JVM logic.
            // Guarded too: getLaunchIntentForPackage goes out to the package
            // manager, and a package in a bad state there (mid-update, a
            // cross-profile entry, a dead provider) throws rather than
            // returning null. Unguarded, that surfaced as a rejected promise
            // from a function whose whole contract is a boolean.
            val intent = try {
                PackageNameValidator.resolveIfValidShape(packageName) {
                    context.packageManager.getLaunchIntentForPackage(it)
                }
            } catch (e: Exception) {
                Log.w("LauncherModule", "could not resolve a launch intent for $packageName", e)
                null
            }
            if (intent == null) {
                return@AsyncFunction false  // malformed, not installed, or not launchable
            }

            // Must go through the current Activity so Android 10+ BAL (background
            // activity launch) restrictions treat this as user-initiated.
            // Starting from the Expo module's Application context is a background
            // start and the system silently drops or defers it: the icon-expand
            // overlay finishes and unmounts while the target activity never
            // reaches the foreground.
            //
            // If currentActivity is null the fix is not to fall back to the
            // Application context — that just re-plays the same silent drop — but
            // to fail loudly. JS side already collapses the overlay and surfaces
            // an alert on `false`, so the user gets an explicit outcome instead
            // of a sinkhole.
            val activity = appContext.currentActivity ?: return@AsyncFunction false

            // Flags: what AOSP's Launcher3 uses to start an app from the home
            // screen. NEW_TASK because the app gets its own task, and
            // RESET_TASK_IF_NEEDED so tapping the icon for an app that is
            // already running behaves like a launcher launch (the task is
            // brought forward and reset to its root) rather than resuming
            // whatever activity happened to be on top.
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)

            // No ActivityOptions bundle.
            //
            // This used to pass ActivityOptions.makeCustomAnimation(activity, 0, 0)
            // to suppress the system's app-open transition, because the launcher
            // draws its own icon-expand animation. 0 is not a valid animation
            // resource id, and the reported symptom of a third-party app that
            // "just fails" — nothing opens, and NO error alert, which means this
            // function returned true — points straight at an options bundle the
            // system rejects while the start itself is dropped. Suppressing a
            // transition is cosmetic; launching the app is not.
            //
            // try/catch so the outcome is never a silent success: startActivity
            // can throw ActivityNotFoundException (the resolved intent went
            // stale) or SecurityException (the target is not exported), and
            // returning false makes the JS side collapse the overlay and show
            // "Could not launch app" instead of leaving the user with an icon
            // that does nothing.
            return@AsyncFunction try {
                activity.startActivity(intent)
                true
            } catch (e: Exception) {
                Log.w("LauncherModule", "launchApp failed for $packageName", e)
                false
            }
        }

        AsyncFunction("getAppIcon") { packageName: String, maskArg: Map<String, Any?>? ->
            try {
                val pm = context.packageManager
                val icon = pm.getApplicationIcon(packageName)
                drawableToBase64(icon, IconMaskSpec.from(maskArg))
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

        // Manual escape hatch (#486) for when the versionCode/treatment cache key
        // doesn't invalidate a stale icon on its own. Deletes every cached PNG;
        // callers (AppsStore.rebuildIconCache) redraw them via getInstalledApps /
        // getAppInfo afterwards. Returns the number of files actually deleted.
        AsyncFunction("clearIconCache") {
            val iconsDir = File(context.filesDir, "icons")
            val files = iconsDir.listFiles() ?: emptyArray()
            files.count { it.delete() }
        }

        AsyncFunction("getIconCacheSizeBytes") {
            val iconsDir = File(context.filesDir, "icons")
            val files = iconsDir.listFiles() ?: emptyArray()
            IconCache.totalSizeBytes(files.map { it.length() })
        }

        AsyncFunction("openLauncherSettings") {
            val intent = Intent(Settings.ACTION_HOME_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        AsyncFunction("goHome") {
            // Fires the system HOME intent, which brings the default launcher
            // (this app, when set as default) to the foreground. Used to emulate
            // the iOS swipe-up-home gesture when our app is in the foreground.
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(intent)
            true
        }

        // ── Performance (§7, #517) ───────────────────────────────────────

        /**
         * Idade do processo em milissegundos: quanto tempo passou desde que o
         * Android começou a arrancar ESTE processo. É a base honesta do cold
         * start — inclui o arranque do processo e do runtime, que uma marca
         * feita em JS já não consegue ver.
         *
         * Devolve -1.0 quando a API não está disponível (< API 24), para o lado
         * JS poder distinguir "sem medição" de "medição zero".
         */
        AsyncFunction("getProcessStartAgeMs") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val age = SystemClock.uptimeMillis() - Process.getStartUptimeMillis()
                if (age >= 0) age.toDouble() else -1.0
            } else {
                -1.0
            }
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

        AsyncFunction("isLocationEnabled") {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            @Suppress("DEPRECATION")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                lm.isLocationEnabled
            } else {
                lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                        lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
            }
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
            // On Android 12+ (API 31) BluetoothAdapter.getName()/getAddress()
            // require the runtime BLUETOOTH_CONNECT permission; without it they
            // throw SecurityException (#675). The safe-call (?.) only guards a
            // null adapter — it does NOT catch a thrown exception — so reading
            // name/address outside a try would reject the whole promise and
            // surface a LogBox toast on every launch. Read each field under its
            // own guard and fall back to the same values the issue expected
            // ("Unknown" / "") instead of letting the call fail.
            val isEnabled = adapter?.isEnabled ?: false
            val name = try {
                adapter?.name ?: "Unknown"
            } catch (e: SecurityException) { "Unknown" }
            val address = try {
                adapter?.address ?: ""
            } catch (e: SecurityException) { "" }
            val paired = try {
                adapter?.bondedDevices?.map { device ->
                    mapOf(
                        "name" to (device.name ?: "Unknown"),
                        "address" to device.address,
                        "type" to device.type
                    )
                } ?: emptyList()
            } catch (e: SecurityException) { emptyList<Map<String, Any>>() }
            mapOf(
                "enabled" to isEnabled,
                "name" to name,
                "address" to address,
                "pairedDevices" to paired
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
                BluetoothDiscoveryReceiver.clear()
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
                // ACTION_PRIVACY_DASHBOARD (the native Privacy Dashboard / App Privacy
                // Report) only exists on API 31+ (Android 12). On older APIs the
                // constant is absent, so we guard the SDK level and fall back to the
                // general privacy settings — a crash here would surface as a dead tile.
                "privacy_dashboard" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    "android.settings.PRIVACY_DASHBOARD_SETTINGS"
                } else {
                    Settings.ACTION_PRIVACY_SETTINGS
                }
                "security" -> Settings.ACTION_SECURITY_SETTINGS
                "cast" -> "android.settings.CAST_SETTINGS"
                "hotspot" -> "android.settings.TETHER_SETTINGS"
                "cellular" -> Settings.ACTION_NETWORK_OPERATOR_SETTINGS
                "data_roaming" -> Settings.ACTION_DATA_ROAMING_SETTINGS
                "appinfo" -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                // ACTION_APN_SETTINGS opens the APN editor. On carrier-locked ROMs it may
                // start a no-op activity; the outer try/catch already falls back gracefully.
                "apn" -> Settings.ACTION_APN_SETTINGS
                else -> { android.util.Log.w("LauncherModule", "openSystemSettings: unknown panel '$panel'"); Settings.ACTION_SETTINGS }
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
                // One entry per launcher activity would report the same package twice
                // (see getInstalledApps), and StorageScreen sums totalBytes across
                // entries — double-counting a package inflates the Apps total.
                val activities = pm.queryIntentActivities(mainIntent, 0)
                    .distinctBy { it.activityInfo.packageName }

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

        // ── Wake Screen (Tap to Wake, #608) ──────────────────────────────
        // Acorda o ecrã quando está apenas "dimmed" pela app (não apagado do
        // SO). Expo RN não tem API para isto; precisa de native module.
        //
        // Limitação documentada: capturar um toque com o ecrã APAGADO do
        // sistema exigiria um receiver de toque a nível de framework
        // (fora do âmbito de um Expo module simples). Este método só é
        // chamado quando a app já recebe o toque (ecrã dimmed/locked pela
        // app), portanto acorda nesse caso — não o SO.
        AsyncFunction("wakeScreen") {
            try {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                @Suppress("DEPRECATION")
                val wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "iostoandroid:tapToWake"
                )
                wakeLock.setReferenceCounted(false)
                wakeLock.acquire(500L)
                wakeLock.release()
            } catch (e: Exception) { /* falha silenciosa: o wake é best-effort */ }
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
            val clean = number.trim()
            if (!PhoneNumberValidator.isValidShape(clean)) {
                return@AsyncFunction false
            }
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:${Uri.encode(clean)}"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        // ── Default Dialer request flow (#919) ─────────────────────────────
        // LauncherInCallService only takes over the call UI once this app is
        // selected as the system's default dialer — being merely installed is
        // not enough. isDefaultDialer is a live poll (same shape as
        // checkPermissions); requestDefaultDialer only launches the OS
        // role/intent and resolves once that launch succeeded, mirroring
        // requestAllPermissions' fire-and-forget contract — the actual
        // decision comes back to the app via the next isDefaultDialer() poll,
        // not via this promise.

        AsyncFunction("isDefaultDialer") {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            telecomManager?.defaultDialerPackage == context.packageName
        }

        AsyncFunction("requestDefaultDialer") {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? android.app.role.RoleManager
                        ?: return@AsyncFunction false
                    if (!roleManager.isRoleAvailable(android.app.role.RoleManager.ROLE_DIALER)) return@AsyncFunction false
                    val activity = appContext.currentActivity ?: return@AsyncFunction false
                    val intent = roleManager.createRequestRoleIntent(android.app.role.RoleManager.ROLE_DIALER)
                    activity.startActivity(intent)
                } else {
                    val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).apply {
                        putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, context.packageName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
                true
            } catch (e: Exception) {
                false
            }
        }

        // ── Incoming calls (#921, passo 6 de #378) ─────────────────────────
        // LauncherInCallService (#919) holds the ringing/active Call reference;
        // these just forward to it. false when there is no call to act on
        // (already answered/ended, or Telecom never bound this service — i.e.
        // this app isn't the default dialer, matching the "nothing changes
        // when we're not the Dialer" acceptance criterion).

        AsyncFunction("answerCall") {
            LauncherInCallService.answerCurrentCall()
        }

        AsyncFunction("rejectCall") { message: String? ->
            LauncherInCallService.rejectCurrentCall(message)
        }

        // ── Call audio routing (#920) ───────────────────────────────────────
        // Mute/route commands only take effect while LauncherInCallService is
        // actually bound for the active call (this app is the default dialer
        // — see requestDefaultDialer above); otherwise there is no InCallService
        // instance to command and these are no-ops that resolve false, matching
        // the CallScreen contract of only enabling the buttons once a real
        // CallAudioState event has been observed (see addCallAudioStateListener).

        AsyncFunction("setMuted") { muted: Boolean ->
            LauncherInCallService.requestMuted(muted)
        }

        AsyncFunction("setAudioRoute") { route: String ->
            val routeInt = CallAudioRouteMapper.fromName(route) ?: return@AsyncFunction false
            LauncherInCallService.requestAudioRoute(routeInt)
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

        // ── Live Activities (#626) ──────────────────────────────────────
        // Android has no single equivalent of iOS Live Activities; the closest
        // native primitive is an ongoing (non-swipeable), low-priority
        // notification whose content is replaced in place. postLiveActivity is
        // an upsert: calling it again with the same id updates the existing
        // notification (NotificationManagerCompat.notify keyed by a stable id
        // derived from it) instead of creating a duplicate.

        AsyncFunction("postLiveActivity") { id: String, title: String, text: String, percent: Int, indeterminate: Boolean ->
            postOrUpdateLiveActivity(id, title, text, percent, indeterminate)
        }

        AsyncFunction("cancelLiveActivity") { id: String ->
            cancelLiveActivity(id)
        }

        // ── Foreground monitor + Protected-Apps gate (#627 child issue) ──

        AsyncFunction("setProtectedApps") { packageNames: List<String>? ->
            // A null payload (careless caller / older JS) means "nothing
            // protected", not a crash — normalize to an immutable empty set.
            LauncherModule.protectedApps = (packageNames ?: emptyList()).toSet()
            true
        }

        AsyncFunction("isForegroundMonitorEnabled") {
            // The AccessibilityService exposes its own enabled state to the
            // system; querying Settings is the canonical way to read it
            // (#627 — we cannot enable it programmatically).
            val svc = Context.ACCESSIBILITY_SERVICE
            val am = context.getSystemService(svc) as? android.view.accessibility.AccessibilityManager
            am?.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                ?.any { it.resolveInfo.serviceInfo.packageName == context.packageName && it.resolveInfo.serviceInfo.name == ForegroundMonitorService::class.java.name }
                ?: false
        }

        AsyncFunction("openAccessibilitySettings") {
            val intent = Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        // ── SMS Send ─────────────────────────────────────────────────────

        // `Coroutine`, not a plain lambda: awaitSmsSendOutcome (below) is a
        // suspend function that waits on the sentIntent broadcast(s), and a
        // plain AsyncFunction body is not a coroutine scope. Same builder
        // HealthConnectModule uses for its suspending body — see the comment
        // there for why a plain lambda fails to compile.
        AsyncFunction("sendSms") Coroutine { address: String, body: String ->
            SmsRequestValidator.validate(address, body)?.let { reason -> throw Exception(reason) }
            if (!hasPermission(android.Manifest.permission.SEND_SMS)) {
                throw Exception("SMS não enviado: permissão SEND_SMS não concedida")
            }

            val smsManager =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    context.getSystemService(android.telephony.SmsManager::class.java)
                        ?: throw Exception("SMS não enviado: sem SmsManager (dispositivo sem telefonia)")
                } else {
                    @Suppress("DEPRECATION")
                    android.telephony.SmsManager.getDefault()
                }

            val parts = smsManager.divideMessage(body)
            // #930: sendSms used to fire-and-forget (sentIntent=null) and always
            // resolve true — the call being accepted for processing is not the
            // same as the radio actually sending it. Now the promise only
            // resolves once every part's sentIntent broadcast confirms RESULT_OK,
            // a distinguishable reason on failure, or a timeout if the broadcast
            // never arrives.
            val outcome = withTimeoutOrNull(SMS_SEND_TIMEOUT_MS) {
                awaitSmsSendOutcome(context, smsManager, address, parts)
            } ?: SmsResultMapper.Outcome(success = false, reason = "timeout")

            if (!outcome.success) {
                throw Exception("SMS não enviado: ${outcome.reason ?: "unknown_error"}")
            }
            true
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
                android.Manifest.permission.RECORD_AUDIO,
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

        // ── Privacy Monitor (#624) ─────────────────────────────────────────
        // Per-sensor breakdown of which INSTALLED apps *declare* the matching
        // permission in their manifest (camera / microphone / location /
        // internet), enumerated locally via PackageManager.GET_PERMISSIONS — a
        // public API. Apps with the QUERY_ALL_PACKAGES permission (declared in
        // this module's manifest) can enumerate every package, so this is a
        // real, on-device catalogue of "which apps can access each sensor".
        //
        // NOTE: the Android Privacy Dashboard uses hidden @SystemApi
        // (AppOpsManager.getHistoricalOps) that is unavailable to third-party
        // apps, so real per-app *access counts* across other apps are not
        // obtainable without root/Shizuku. We therefore report the set of apps
        // that *can* access each sensor — never fabricated access tallies. `count`
        // is 1 per app (it denotes "this app is in the set"), `totalAccesses`
        // mirrors the number of apps, and `topApps` is the ranked app list.
        AsyncFunction("getPrivacyReport") {
            try {
                val pm = context.packageManager
                val endTime = System.currentTimeMillis()

                fun appLabel(pkg: String): String {
                    return try {
                        val ai = pm.getApplicationInfo(pkg, 0)
                        pm.getApplicationLabel(ai).toString()
                    } catch (e: Exception) { pkg }
                }

                // Apps that declare [perm] in their manifest. Public API:
                // GET_PERMISSIONS exposes requestedPermissions; null when the
                // package is gone mid-iteration — treated as "no apps" rather
                // than thrown.
                fun appsWithPermission(perm: String): List<Pair<String, String>> {
                    val result = mutableListOf<Pair<String, String>>()
                    val installed = try {
                        pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    } catch (e: Exception) { emptyList<ApplicationInfo>() }
                    for (ai in installed) {
                        val perms = try {
                            pm.getPackageInfo(ai.packageName, PackageManager.GET_PERMISSIONS)
                                .requestedPermissions
                        } catch (e: Exception) { null }
                        if (perms != null && perms.contains(perm)) {
                            result.add(ai.packageName to appLabel(ai.packageName))
                        }
                    }
                    return result
                }

                fun sensorReport(
                    perm: String,
                    sensor: String,
                    label: String,
                    icon: String,
                    bg: String,
                ): Map<String, Any> {
                    val ranked = appsWithPermission(perm)
                        .sortedBy { (pkg, _) -> pkg.lowercase() }
                        .map { (pkg, name) ->
                            mapOf(
                                "packageName" to pkg,
                                "appName" to name,
                                "count" to 1,
                            )
                        }
                    return mapOf(
                        "sensor" to sensor,
                        "label" to label,
                        "icon" to icon,
                        "bg" to bg,
                        "totalAccesses" to ranked.size,
                        "appCount" to ranked.size,
                        "topApps" to ranked,
                    )
                }

                val sensors = listOf(
                    sensorReport(
                        android.Manifest.permission.CAMERA,
                        "camera",
                        "Camera",
                        "camera",
                        "#1C1C1E",
                    ),
                    sensorReport(
                        android.Manifest.permission.RECORD_AUDIO,
                        "microphone",
                        "Microphone",
                        "mic",
                        "#FF2D55",
                    ),
                    sensorReport(
                        android.Manifest.permission.ACCESS_FINE_LOCATION,
                        "location",
                        "Location",
                        "location",
                        "#007AFF",
                    ),
                    sensorReport(
                        android.Manifest.permission.INTERNET,
                        "network",
                        "Network",
                        "globe",
                        "#34C759",
                    ),
                )

                mapOf(
                    "generatedAt" to endTime,
                    "sensors" to sensors,
                )
            } catch (e: Exception) {
                mapOf(
                    "generatedAt" to System.currentTimeMillis(),
                    "sensors" to emptyList<Map<String, Any>>(),
                )
            }
        }

        // ── Keyboards ────────────────────────────────────────────────────

        AsyncFunction("getInstalledKeyboards") {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            val enabled = imm.enabledInputMethodList.map { it.id }.toSet()
            imm.inputMethodList.map { imi ->
                mapOf("id" to imi.id, "label" to imi.loadLabel(context.packageManager).toString(), "enabled" to enabled.contains(imi.id))
            }
        }

        // ── Ringtone ─────────────────────────────────────────────────────

        AsyncFunction("getRingtone") {
            val uri = android.media.RingtoneManager.getActualDefaultRingtoneUri(
                context, android.media.RingtoneManager.TYPE_RINGTONE
            )
            uri?.toString() ?: ""
        }

        AsyncFunction("canWriteSystemSettings") {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                android.provider.Settings.System.canWrite(context)
            } else {
                true
            }
        }

        AsyncFunction("openWriteSettingsAccess") {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_MANAGE_WRITE_SETTINGS,
                android.net.Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        AsyncFunction("setRingtone") { uri: String ->
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M &&
                !android.provider.Settings.System.canWrite(context)
            ) {
                return@AsyncFunction false
            }
            try {
                android.media.RingtoneManager.setActualDefaultRingtoneUri(
                    context,
                    android.media.RingtoneManager.TYPE_RINGTONE,
                    android.net.Uri.parse(uri)
                )
                true
            } catch (e: Exception) { false }
        }

        // ── Speech recognition (Siri / voice-to-text) ────────────────────

        // Reference to the in-flight recognizer so stopSpeechRecognition can
        // tear it down. Guarded with @Volatile + synchronized because the
        // recognition listener callbacks arrive on the main looper thread.
        AsyncFunction("startSpeechRecognition") {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                val bundle = Bundle().apply {
                    putString("error", "Speech recognition unavailable on this device")
                }
                sendEvent("onSpeechError", bundle)
                return@AsyncFunction false
            }
            synchronized(this@LauncherModule) {
                activeRecognizer?.destroy()
                val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
                activeRecognizer = recognizer
                recognizer.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}

                    override fun onPartialResults(partialResults: Bundle?) {
                        val matches = partialResults?.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION
                        )
                        val text = matches?.firstOrNull() ?: return
                        val bundle = Bundle().apply { putString("text", text) }
                        sendEvent("onSpeechPartialResult", bundle)
                    }

                    override fun onResults(results: Bundle?) {
                        val matches = results?.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION
                        )
                        val text = matches?.firstOrNull() ?: return
                        val bundle = Bundle().apply { putString("text", text) }
                        sendEvent("onSpeechResult", bundle)
                    }

                    override fun onError(error: Int) {
                        val bundle = Bundle().apply { putString("error", "SpeechRecognizer error $error") }
                        sendEvent("onSpeechError", bundle)
                    }
                })
            }
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            // startListening must run on the main looper; the bridge call may
            // arrive on a different thread.
            if (Looper.myLooper() == Looper.getMainLooper()) {
                activeRecognizer?.startListening(intent)
            } else {
                Handler(Looper.getMainLooper()).post {
                    activeRecognizer?.startListening(intent)
                }
            }
            true
        }

        AsyncFunction("stopSpeechRecognition") {
            synchronized(this@LauncherModule) {
                val recognizer = activeRecognizer
                activeRecognizer = null
                if (recognizer == null) return@AsyncFunction false
                try {
                    recognizer.stopListening()
                    recognizer.destroy()
                } catch (_: Exception) {}
                true
            }
        }

        AsyncFunction("isSpeechRecognitionAvailable") {
            SpeechRecognizer.isRecognitionAvailable(context)
        }

        AsyncFunction("startTapDetection") {
            // #636: start the foreground sensor service that detects double/triple
            // back taps via accelerometer + gyroscope and emits `onBackTap`.
            // Best-effort: on a device without the sensors or the foreground
            // permission the service simply won't start, and callers should not
            // reject the whole promise over it.
            try {
                TapSensorService.start(context)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("stopTapDetection") {
            try {
                TapSensorService.stop(context)
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("isTapDetectionRunning") {
            // #636: report whether the back-tap sensor service is currently active,
            // sourced from the static flag maintained by TapSensorService itself
            // (set in onCreate/onDestroy).
            TapSensorService.isRunning
        }

        // ── App access (sensor usage) — issue #634 ────────────────────────
        //
        // A foreground service (AccessEventsService) polls the UsageStats event
        // stream + AppOps "last access" timestamps every 15s and emits onAppAccess
        // for genuinely NEW camera/mic/location use by a foreground app. These
        // three methods are the RN surface for it. There is no universal broadcast
        // for sensor access, so this is a heuristic over the usage-access data the
        // app already requests for Screen Time — see AccessEventsService.kt for
        // the per-OEM limitations.

        AsyncFunction("getRecentAccessEvents") { limit: Int ->
            try {
                val svc = AccessEventsService.instance
                val events = svc?.getRecentEvents(limit) ?: emptyList()
                events.map { e ->
                    mapOf(
                        "packageName" to e.packageName,
                        "appName" to e.appName,
                        "accessType" to e.accessType,
                        "timestamp" to e.timestamp,
                    )
                }
            } catch (e: Exception) { emptyList<Map<String, Any>>() }
        }

        AsyncFunction("startAccessTrackingService") {
            try {
                val intent = Intent(context, AccessEventsService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    @Suppress("DEPRECATION")
                    context.startService(intent)
                }
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("stopAccessTrackingService") {
            try {
                context.stopService(Intent(context, AccessEventsService::class.java))
                true
            } catch (e: Exception) { false }
        }

        AsyncFunction("isAccessTrackingServiceRunning") {
            AccessEventsService.instance != null
        }
        // ── Lifecycle ────────────────────────────────────────────────────

        OnCreate {
            // Dynamic registration is mandatory: since API 26 the implicit
            // PACKAGE_ADDED/REMOVED/REPLACED broadcasts are not delivered to
            // receivers declared in the manifest.
            try {
                PackageChangeReceiver.register(appContext.reactContext ?: return@OnCreate)
            } catch (_: Exception) {}
        }

        OnDestroy {
            // Best-effort cleanup: unregister any lingering BroadcastReceivers and
            // clear the companion-object back-reference so NotificationService stops
            // routing events to a stale module instance.
            try {
                val ctx = appContext.reactContext ?: return@OnDestroy
                BluetoothDiscoveryReceiver.unregister(ctx)
                PackageChangeReceiver.unregister(ctx)
            } catch (_: Exception) {}
            instance = null
            try { activeRecognizer?.destroy() } catch (_: Exception) {}
            activeRecognizer = null
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    // Live Activities (#626). id.hashCode() collisions are astronomically
    // unlikely for the small number of concurrent live activities a real
    // caller would ever run, and even a collision only means two activities
    // share one notification slot — not a crash.
    private fun liveActivityNotificationId(id: String): Int = id.hashCode()

    private fun ensureLiveActivityChannel() {
        val manager = androidx.core.app.NotificationManagerCompat.from(context)
        if (manager.getNotificationChannel(LIVE_ACTIVITY_CHANNEL_ID) != null) return
        val channel = androidx.core.app.NotificationChannelCompat.Builder(
            LIVE_ACTIVITY_CHANNEL_ID,
            android.app.NotificationManager.IMPORTANCE_LOW
        ).setName("Live Activities").build()
        manager.createNotificationChannel(channel)
    }

    private fun postOrUpdateLiveActivity(
        id: String,
        title: String,
        text: String,
        percent: Int,
        indeterminate: Boolean,
    ): Boolean {
        if (id.isBlank()) return false
        ensureLiveActivityChannel()
        val notification = androidx.core.app.NotificationCompat.Builder(context, LIVE_ACTIVITY_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, percent.coerceIn(0, 100), indeterminate)
            .build()
        androidx.core.app.NotificationManagerCompat.from(context).notify(liveActivityNotificationId(id), notification)
        return true
    }

    private fun cancelLiveActivity(id: String): Boolean {
        if (id.isBlank()) return false
        androidx.core.app.NotificationManagerCompat.from(context).cancel(liveActivityNotificationId(id))
        return true
    }

    private fun hasPermission(permission: String): Boolean {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            context, permission
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    /**
     * Registers a one-shot [BroadcastReceiver] as the `sentIntent` for every
     * part of an SMS send (one PendingIntent per part — the OS fires each
     * one separately, once its part is handed to the radio) and suspends
     * until all parts have reported, aggregating via [SmsResultMapper]. The
     * receiver always unregisters exactly once: on the normal completion
     * path, or via `invokeOnCancellation` when the caller (the
     * withTimeoutOrNull in AsyncFunction("sendSms")) cancels this coroutine.
     */
    private suspend fun awaitSmsSendOutcome(
        context: Context,
        smsManager: android.telephony.SmsManager,
        address: String,
        parts: ArrayList<String>,
    ): SmsResultMapper.Outcome = suspendCancellableCoroutine { continuation ->
        val requestId = smsSendRequestId.incrementAndGet()
        val action = "$SMS_SENT_ACTION_PREFIX.$requestId"
        val results = IntArray(parts.size) { Int.MIN_VALUE }
        var remaining = parts.size

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, intent: Intent?) {
                val partIndex = intent?.getIntExtra(EXTRA_SMS_PART_INDEX, -1) ?: -1
                // Ignore a part we've already recorded: onReceive can fire
                // again for the same PendingIntent (e.g. a stray redelivery),
                // and double-counting it would let `remaining` reach zero
                // before every real part has reported.
                if (partIndex < 0 || partIndex >= results.size || results[partIndex] != Int.MIN_VALUE) {
                    return
                }
                results[partIndex] = resultCode
                remaining--
                if (remaining == 0) {
                    try { context.unregisterReceiver(this) } catch (_: Exception) {}
                    if (continuation.isActive) {
                        continuation.resumeWith(Result.success(SmsResultMapper.aggregate(results.toList())))
                    }
                }
            }
        }

        androidx.core.content.ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(action),
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        continuation.invokeOnCancellation {
            try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
        }

        val sentIntents = ArrayList<PendingIntent>(parts.size)
        for (i in parts.indices) {
            val intent = Intent(action).putExtra(EXTRA_SMS_PART_INDEX, i).setPackage(context.packageName)
            sentIntents.add(
                PendingIntent.getBroadcast(
                    context,
                    requestId * 1000 + i,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )
        }

        // The SmsManager calls below can throw synchronously (e.g. an invalid
        // address, or a permission revoked between hasPermission() and here)
        // before any sentIntent broadcast is ever scheduled. That throw isn't
        // a coroutine cancellation, so invokeOnCancellation above would never
        // run — without this catch the receiver registered a few lines up
        // would leak.
        try {
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(address, null, parts, sentIntents, null)
            } else {
                smsManager.sendTextMessage(address, null, parts[0], sentIntents[0], null)
            }
        } catch (e: Exception) {
            try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
            throw e
        }
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

    /** [PackageInfo.versionCode] is deprecated (32-bit, wraps); longVersionCode is its
     * Android P+ replacement. Used as part of the icon cache key so an app update
     * invalidates its cached PNG for free. */
    private fun getVersionCode(pm: PackageManager, packageName: String): Long {
        val info = pm.getPackageInfo(packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
    }

    private fun writeIconToFile(
        drawable: Drawable,
        file: File,
        mask: IconMaskSpec = IconMaskSpec.DEFAULT,
        treatment: String = IconTreatment.DEFAULT
    ) {
        val bitmap = renderIcon(drawable, mask, treatment)
        val scaledBitmap = Bitmap.createScaledBitmap(bitmap, 128, 128, true)
        FileOutputStream(file).use { out ->
            scaledBitmap.compress(Bitmap.CompressFormat.PNG, 90, out)
        }
        if (bitmap != scaledBitmap) scaledBitmap.recycle()
    }

    private fun drawableToBase64(
        drawable: Drawable,
        mask: IconMaskSpec = IconMaskSpec.DEFAULT,
        treatment: String = IconTreatment.DEFAULT
    ): String {
        val bitmap = renderIcon(drawable, mask, treatment)
        val scaledBitmap = Bitmap.createScaledBitmap(bitmap, 128, 128, true)
        val outputStream = ByteArrayOutputStream()
        scaledBitmap.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
        val bytes = outputStream.toByteArray()
        if (bitmap != scaledBitmap) scaledBitmap.recycle()
        return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    /**
     * Renders [drawable] to a square bitmap, honouring [treatment] (#486 — see
     * [IconTreatment.shouldMask] for the adaptive/non-adaptive distinction) and
     * [mask] (#482 — the shape/exponent applied to the result).
     */
    private fun renderIcon(
        drawable: Drawable,
        mask: IconMaskSpec = IconMaskSpec.DEFAULT,
        treatment: String = IconTreatment.DEFAULT
    ): Bitmap {
        val isAdaptive = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && drawable is AdaptiveIconDrawable
        val shouldMask = IconTreatment.shouldMask(isAdaptive, treatment)
        val square = drawableToBitmap(drawable, mask, shouldMask)
        return if (shouldMask) maskIcon(square, mask) else square
    }

    private fun drawableToBitmap(
        drawable: Drawable,
        mask: IconMaskSpec = IconMaskSpec.DEFAULT,
        shouldMask: Boolean = true
    ): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return drawable.bitmap
        }
        // AdaptiveIconDrawable.draw() composites background+foreground using
        // whatever mask the OS (or OEM launcher) has configured, so drawing it
        // directly here would still yield a device-dependent shape — the exact
        // inconsistency #484 exists to fix. Compose it ourselves instead; only
        // fall back to the generic path below when the icon is malformed
        // (composeAdaptiveIcon returns null, e.g. no background layer).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && drawable is AdaptiveIconDrawable) {
            // Este caminho ja devolve o bitmap mascarado pelo compositor do #484,
            // e o call site volta a passar tudo pelo applySquircleMask do #480.
            // Aplicar duas vezes e' idempotente NA FORMA: os dois usam o mesmo
            // expoente (AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT = 5.0 e o
            // n = 5.0 do applySquircleMask) e o mesmo gerador de pontos, portanto a
            // segunda mascara recorta exactamente a mesma regiao. Se algum dia os
            // expoentes divergirem, isto passa a cortar duas formas diferentes —
            // e a razao pela qual ambos os sitios citam a constante.
            composeAdaptiveIcon(drawable, mask, shouldMask)?.let { return it }
        }
        // Center-crop para quadrado (#480): pega no maior quadrado centrado da
        // origem e escala-o. Nunca distorce nem mete barras transparentes, por
        // isso um icone-banner mantem as proporcoes e e' so cortado antes da
        // mascara. Um icone redondo continua a ficar com cantos vazios — o #480
        // diz explicitamente que nao resolve isso.
        val srcW = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 128
        val srcH = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 128
        val side = srcW.coerceAtMost(srcH)
        val src = Bitmap.createBitmap(srcW, srcH, Bitmap.Config.ARGB_8888)
        Canvas(src).apply {
            drawable.setBounds(0, 0, srcW, srcH)
            drawable.draw(this)
        }
        val left = (srcW - side) / 2
        val top = (srcH - side) / 2
        val square = Bitmap.createBitmap(src, left, top, side, side)
        if (square != src) src.recycle()
        // Circular/banner icons would show transparent corners after the
        // squircle mask; backfill them with the icon's edge colour so the
        // silhouette stays solid (#465/#480, now addressed).
        return backfillTransparentCorners(square)
    }

    /**
     * Composes an AdaptiveIconDrawable ourselves: background layer clipped to
     * our own squircle mask, foreground layer scaled to
     * [AdaptiveIconCompositor.FOREGROUND_SCALE] and centered on top. Returns
     * null for a malformed icon with no background layer, so the caller falls
     * back to the generic drawable-to-bitmap path.
     *
     * AdaptiveIconDrawable also exposes getMonochrome() (API 33+, used for
     * themed/monochrome icons) — out of scope for #484, not handled here.
     */
    /**
     * Clip [src] to a 4.7-exponent superellipse (iOS-style squircle) and return
     * the masked bitmap. Applied to every icon emitted by getInstalledApps and
     * getAppIcon, so the launcher grid and the dock share one silhouette.
     *
     * Masking strategy:
     *  - Output is a square of the smallest source dimension, so non-square
     *    icons are center-cropped (drawableToBitmap) and the mask never sees a
     *    rectangle.
     *  - The clip path is built from [SuperellipsePath.points] — the SAME
     *    generator that drives the TS/SVG reference in src/theme/squircle.ts —
     *    so the native mask cannot drift from the reference geometry.
     *  - Anti-aliasing uses a BitmapShader painted through the superellipse
     *    Path via Canvas.drawPath(..., ANTI_ALIAS_FLAG). Path fills are
     *    anti-aliased by drawPath (unlike clipPath, which is not), so the edge
     *    stays smooth at 60pt instead of serrated.
     *  - A circular source icon will still show empty (transparent) corners
     *    after masking; those are backfilled with [KMeansColorPicker]'s
     *    dominant colour before the mask is even applied (§4.1.3 of epic
     *    #466), see [backfillTransparentCorners].
     */
    /**
     * Applies [mask] to [src]: the superellipse mask at the requested exponent,
     * or the bitmap untouched when the mask is 'original'. This is the single
     * place where "no mask" is honoured — the drawable then reaches the caller
     * exactly as the system gave it.
     */
    private fun maskIcon(src: Bitmap, mask: IconMaskSpec): Bitmap {
        val exponent = mask.exponent ?: return src
        return applySquircleMask(src, exponent)
    }

    private fun applySquircleMask(src: Bitmap, n: Double = 5.0): Bitmap {
        val size = src.width.coerceAtMost(src.height)
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader }
        Canvas(out).drawPath(buildSuperellipsePath(size, n), paint)
        return out
    }

    /**
     * Average the four edge-midpoint pixels of [src]. Fallback used by
     * [backfillTransparentCorners] only when [KMeansColorPicker] finds no
     * usable cluster (e.g. an icon that is itself almost entirely white or
     * black, so every cluster gets discarded) — kept because it is still
     * better than an arbitrary fixed colour in that degenerate case.
     */
    private fun edgeMidpointColor(src: Bitmap): Int {
        val w = src.width
        val h = src.height
        val cx = w / 2
        val cy = h / 2
        var r = 0
        var g = 0
        var b = 0
        var n = 0
        for ((x, y) in listOf(Pair(cx, 0), Pair(cx, h - 1), Pair(0, cy), Pair(w - 1, cy))) {
            val c = src.getPixel(x, y)
            if (Color.alpha(c) == 0) continue
            r += Color.red(c); g += Color.green(c); b += Color.blue(c); n++
        }
        if (n == 0) return Color.BLACK
        return Color.rgb(r / n, g / n, b / n)
    }

    /**
     * Backfill transparent corners of [src] with its k-means dominant colour
     * (§4.1.3 of epic #466) so a circular/banner icon keeps a solid
     * silhouette after masking, instead of a hole that shows through to
     * whatever sits under the launcher grid. Falls back to
     * [edgeMidpointColor] when [KMeansColorPicker] finds no usable cluster.
     * Returns the original bitmap when it already fills its bounds. Runs once
     * per icon at cache-write time (called only from [writeIconToFile], which
     * itself only runs when the cached PNG doesn't exist yet) — a cache hit
     * never re-enters this function.
     */
    private fun backfillTransparentCorners(src: Bitmap): Bitmap {
        val w = src.width
        val h = src.height
        // Quick reject: if the centre pixel is opaque, the icon fills its box
        // (square/adaptive) and masking can't expose a hole.
        if (Color.alpha(src.getPixel(w / 2, h / 2)) != 0) return src
        val pixels = IntArray(w * h)
        src.getPixels(pixels, 0, w, 0, 0, w, h)
        val fill = KMeansColorPicker.dominantColor(pixels) ?: edgeMidpointColor(src)
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(fill)
        Canvas(out).drawBitmap(src, 0f, 0f, null)
        return out
    }

    /** Build an android.graphics.Path for the superellipse in a [size]×[size] box. */
    private fun buildSuperellipsePath(size: Int, n: Double): Path {
        val pts = SuperellipsePath.points(size, n, 64)
        return Path().apply {
            if (pts.isEmpty()) return@apply
            val first = pts[0]
            moveTo(first.first.toFloat(), first.second.toFloat())
            for (i in 1 until pts.size) {
                val p = pts[i]
                lineTo(p.first.toFloat(), p.second.toFloat())
            }
            close()
        }
    }

    private fun composeAdaptiveIcon(
        drawable: AdaptiveIconDrawable,
        mask: IconMaskSpec = IconMaskSpec.DEFAULT,
        shouldMask: Boolean = true
    ): Bitmap? {
        val background = drawable.background ?: return null
        val foreground = drawable.foreground

        val size = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 108
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        // shouldMask=false (#486 'none') ou mask 'original' (exponent null) não
        // recortam nada: o fundo é desenhado inteiro e o resultado é o composite
        // do sistema sem silhueta imposta.
        val exponent = if (shouldMask) mask.exponent else null
        if (exponent != null) {
            // Clip por drawPath (Paths são anti-alias em drawPath, ao contrário
            // de clipPath) — igual ao applySquircleMask dos ícones não-adaptivos,
            // para a borda não serrilhar a grandes tamanhos (#480/AA).
            val maskPoints = AdaptiveIconCompositor.squirclePoints(size.toFloat(), exponent)
            val maskPath = Path().apply {
                if (maskPoints.isNotEmpty()) {
                    moveTo(maskPoints[0].first, maskPoints[0].second)
                    maskPoints.drop(1).forEach { (x, y) -> lineTo(x, y) }
                    close()
                }
            }
            // Fundo desenhado num bitmap à parte e pintado através do maskPath
            // com um shader + ANTI_ALIAS_FLAG, para a silhueta sair suave.
            val bgBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            Canvas(bgBitmap).apply {
                background.setBounds(0, 0, size, size)
                background.draw(this)
            }
            Canvas(bitmap).drawPath(maskPath, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.shader = BitmapShader(bgBitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            })
        } else {
            background.setBounds(0, 0, size, size)
            background.draw(canvas)
        }

        if (foreground != null) {
            val bounds = AdaptiveIconCompositor.foregroundBounds(size)
            foreground.setBounds(bounds.offset, bounds.offset, bounds.offset + bounds.scaledSize, bounds.offset + bounds.scaledSize)
            foreground.draw(canvas)
        }

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
