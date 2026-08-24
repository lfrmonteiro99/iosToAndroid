package com.iostoandroid.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageStatsManager
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.util.Calendar
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * Foreground service that observes app access to the camera, microphone and
 * location over a trailing window and surfaces it to RN (#634).
 *
 * There is NO universal Android broadcast for "app X just opened the camera".
 * What we DO have, on the usage-access path the app already requests for Screen
 * Time (see LauncherModule.isUsageAccessGranted / getScreenTimeStats):
 *   - UsageStatsManager.queryEvents(start, now) exposes a contiguous stream of
 *     ACTIVITY_RESUMED / ACTIVITY_PAUSED, plus (API 29+) CONFIGURATION_CHANGE
 *     and (API 29+) the foreground-service–style events; and
 *   - AppOpsManager.noteOp / checkOp for OPSTR_CAMERA / OPSTR_RECORD_AUDIO /
 *     OPSTR_FINE_LOCATION reports the last time each op ran for a package, i.e.
 *     the timestamp of the most recent sensor access.
 *
 * The honest, shippable signal is therefore: poll the UsageStats event stream on
 * a coarse interval, and for each package that came to the foreground look at the
 * AppOps "last access" timestamps. If a sensor's last-access timestamp is within
 * the poll interval AND newer than the last time we reported that package, that
 * package used the sensor during this window — emit one onAppAccess event.
 *
 * This is a HEURISTIC, not a real-time hook, and it inherits every AppOps
 * limitation:
 *   - It requires the PACKAGE_USAGE_STATS permission (the same Settings screen as
 *     Screen Time). Without it we emit nothing and the bridge returns [].
 *   - Several OEM ROMs (MIUI/HyperOS, EMUI, ColorOS, One UI in some modes) do
 *     not populate AppOps last-access timestamps reliably, or throttle the
 *     usage-event stream. On those devices the list will be sparse or empty even
 *     though access happened. We document this per the issue's "document limits
 *     by manufacturer" requirement rather than pretend the data is complete.
 *   - Location "last access" via OPSTR_FINE_LOCATION is the closest universal
 *     proxy; some devices only populate it for foreground location.
 *
 * To avoid spamming RN with one event per poll, we only emit when a package's
 * last-access timestamp advances past the value we already reported — i.e. a
 * genuinely NEW access since the last emit. Bursts of the same sensor from the
 * same package within one poll collapse to a single event.
 */
class AccessEventsService : Service() {

    companion object {
        private const val TAG = "AccessEventsService"
        const val NOTIFICATION_CHANNEL_ID = "access_events"
        const val NOTIFICATION_ID = 6341

        // 15s strike a balance: tight enough that a foreground-app camera open is
        // reported promptly, loose enough that the usage-event scan + AppOps
        // lookups don't keep a core awake. OEMs already throttle usage events, so
        // going faster would only burn battery for no extra signal.
        private const val POLL_INTERVAL_MS = 15_000L
        private const val EVENT_LOOKBACK_MS = 60_000L

        @Volatile var instance: AccessEventsService? = null

        /** Ring buffer of raw access events for getRecentAccessEvents(). */
        private val recent = ConcurrentLinkedQueue<AccessEvent>()
        private const val MAX_RECENT = 500

        // packageName\0type -> last timestamp we already emitted, so we only
        // forward NEW accesses.
        private val lastReported = mutableMapOf<String, Long>()

        fun getRecentEvents(cap: Int): List<AccessEvent> {
            val all = recent.toList()
            return if (cap <= 0) all else all.takeLast(cap)
        }

        fun clearRecent() = recent.clear()
    }

    data class AccessEvent(
        val packageName: String,
        val appName: String,
        val accessType: String, // "camera" | "microphone" | "location"
        val timestamp: Long,
    )

    private val running = AtomicBoolean(false)
    private var pollThread: HandlerThread? = null
    private var pollHandler: Handler? = null
    private val binder = Binder()

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        if (running.compareAndSet(false, true)) {
            pollThread = HandlerThread("AccessEventsPoller").also { t ->
                t.start()
                pollHandler = Handler(t.looper)
                pollHandler?.postDelayed(::poll, POLL_INTERVAL_MS)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        pollHandler?.removeCallbacksAndMessages(null)
        pollThread?.quitSafely()
        pollThread = null
        instance = null
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "App access tracking",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Tracks which apps used the camera, microphone or location"
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("Acompanhamento de acesso")
            .setContentText("A câmara, o microfone e a localização estão a ser monitorizados")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .build()
    }

    private fun appLabel(pm: PackageManager, packageName: String): String {
        return try {
            val ai = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(ai).toString()
        } catch (e: Exception) {
            packageName
        }
    }

    /** One scan pass: find packages that used a sensor since the last emit. */
    private fun poll() {
        if (!running.get()) return
        try {
            scan()
        } catch (e: Exception) {
            // A scan failure (usage permission revoked mid-run, transient binder
            // death) must never crash the poller — just skip this tick.
            Log.w(TAG, "scan failed: ${e.message}")
        } finally {
            if (running.get()) pollHandler?.postDelayed(::poll, POLL_INTERVAL_MS)
        }
    }

    private fun scan() {
        val ctx = this
        val pm = ctx.packageManager
        val usage = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return

        // Without usage access none of this is populated — emit nothing.
        val usageAllowed = try {
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                ctx.packageName,
            ) == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) { false }
        if (!usageAllowed) return

        val now = System.currentTimeMillis()
        val start = max(1, now - EVENT_LOOKBACK_MS)

        // Packages that came to the foreground during this look-back. UsageStats
        // queryEvents gives ACTIVITY_RESUMED transitions; that is the set of
        // apps that could have accessed a sensor. (We don't need the full event
        // stream — only the distinct package names.)
        val foregroundPkgs = mutableSetOf<String>()
        try {
            val events = usage.queryEvents(start, now)
            val ev = android.app.usage.UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                if (ev.eventType == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) {
                    foregroundPkgs.add(ev.packageName)
                }
            }
        } catch (e: Exception) {
            // Some OEMs throw SecurityException / IllegalStateException on
            // queryEvents even with the op allowed. Treat as "no signal".
            return
        }

        for (pkg in foregroundPkgs) {
            if (pkg == ctx.packageName) continue // don't report our own launcher
            val label = appLabel(pm, pkg)
            reportIfNew(pkg, label, "camera",
                lastOpTime(appOps, pm, pkg, AppOpsManager.OPSTR_CAMERA), now)
            reportIfNew(pkg, label, "microphone",
                lastOpTime(appOps, pm, pkg, AppOpsManager.OPSTR_RECORD_AUDIO), now)
            reportIfNew(pkg, label, "location",
                lastOpTime(appOps, pm, pkg, AppOpsManager.OPSTR_FINE_LOCATION), now)
        }
    }

    /**
     * AppOpsManager does not expose a public "get last access time" before API 29.
     * The hidden `getOpsForPackage` is the only source of that timestamp, but it is
     * a @hide API absent from the public compile stub — so it is reached via
     * reflection (see [lastOpTime]). On failure (older/vendor ROMs without the
     * hidden method) we simply report no access time (0L) rather than crash.
     */
    /**
     * AppOpsManager.getOpsForPackage(...) is a @hide API — it is NOT present in the
     * public compile stub, so calling it directly fails to compile. The only stable
     * way to reach it is reflection; the runtime call itself is guarded by a
     * try/catch so a device without the hidden method simply reports no access
     * time (0L) instead of crashing.
     */
    private fun lastOpTime(appOps: AppOpsManager, pm: PackageManager, pkg: String, opStr: String): Long {
        val uid = try {
            pm.getPackageUid(pkg, 0)
        } catch (e: Exception) { return 0L }
        return try {
            val getOps = AppOpsManager::class.java.getMethod(
                "getOpsForPackage", Int::class.javaPrimitiveType, String::class.java, Array<String>::class.java
            )
            // getOpsForPackage returns a List<PackageOps> (a @hide type); reflect it.
            val rawOps = getOps?.invoke(appOps, uid, pkg, arrayOf(opStr))
            val ops = rawOps as? List<*> ?: return 0L
            if (ops.isEmpty()) return 0L
            // Each element is a PackageOps with an `ops: List<OpEntry>` field.
            val pkgOps = ops.firstOrNull() ?: return 0L
            val opsField = pkgOps.javaClass.getField("ops")
            @Suppress("UNCHECKED_CAST")
            val opList = opsField.get(pkgOps) as? List<Any> ?: return 0L
            val opEntry = opList.firstOrNull { entry ->
                val opStrField = entry.javaClass.getField("opStr")
                opStrField.get(entry) as? String == opStr
            } ?: return 0L
            // getLastAccessTime() is API 29+; fall back to getTime() (deprecated)
            // on older APIs. We guard the call by SDK version.
            val t = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val m = opEntry.javaClass.getMethod("getLastAccessTime")
                m.invoke(opEntry) as? Long
            } else {
                @Suppress("DEPRECATION")
                val m = opEntry.javaClass.getMethod("getTime")
                m.invoke(opEntry) as? Long
            }
            t ?: 0L
        } catch (e: Exception) {
            0L
        }
    }

    private fun reportIfNew(pkg: String, label: String, type: String, ts: Long, now: Long) {
        if (ts <= 0L) return
        // Only count an access as "recent" if it happened inside the trailing
        // window we actually scanned this tick.
        if (ts < now - EVENT_LOOKBACK_MS) return
        val key = "$pkg\u0000$type"
        val prev = lastReported[key] ?: 0L
        if (ts <= prev) return // not a new access since we last reported
        lastReported[key] = ts
        val event = AccessEvent(pkg, label, type, ts)
        recent.add(event)
        while (recent.size > MAX_RECENT) recent.poll()
        // Forward to JS through the module's event emitter (same channel as the
        // notification / package-change events).
        val bundle = android.os.Bundle().apply {
            putString("packageName", pkg)
            putString("appName", label)
            putString("accessType", type)
            putDouble("timestamp", ts.toDouble())
        }
        LauncherModule.emitEvent("onAppAccess", bundle)
    }
}
