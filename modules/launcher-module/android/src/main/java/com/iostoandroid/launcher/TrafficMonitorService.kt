package com.iostoandroid.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.TrafficStats
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service that samples per-app network traffic via
 * `TrafficStats.getUidTxBytes/RxBytes(uid)` on a coarse interval and persists
 * the DELTA (not the raw cumulative counter) per app per day (#624-S4, child
 * of #624).
 *
 * `TrafficStats` gives cumulative bytes since the last device boot, with no
 * VPN and no special permission beyond the already-implicit INTERNET — but
 * "cumulative since boot" is useless for "MB in the last 24h" on its own.
 * Two cumulative samples have to be diffed into a delta
 * ([NetworkUsageCalculator.computeDelta]) and the deltas accumulated into a
 * per-day bucket, the same way [AccessEventsService] turns a raw event stream
 * into per-package counts for the sensor-access feature (#634) — see that file
 * for the sibling pattern this one follows.
 *
 * No VPN, no `VpnService`: this deliberately reads only the per-UID counters
 * Android already exposes to every app.
 */
class TrafficMonitorService : Service() {

    companion object {
        private const val TAG = "TrafficMonitorService"
        const val NOTIFICATION_CHANNEL_ID = "network_usage"
        const val NOTIFICATION_ID = 7241

        // 20 minutes: frequent enough that "usage today" feels current, coarse
        // enough that the poll (a PackageManager scan + two syscalls per app)
        // doesn't keep a core awake or drain battery — the same trade-off
        // AccessEventsService documents for its own poll interval.
        private const val POLL_INTERVAL_MS = 20 * 60 * 1000L
        private const val DAY_MS = 24 * 60 * 60 * 1000L

        private const val PREFS_NAME = "network_usage_prefs"
        private const val KEY_KNOWN_BUCKETS = "known_buckets"
        private const val KEY_LAST_TX_PREFIX = "last_tx_"
        private const val KEY_LAST_RX_PREFIX = "last_rx_"
        private const val KEY_BUCKET_TX_PREFIX = "bucket_tx_"
        private const val KEY_BUCKET_RX_PREFIX = "bucket_rx_"

        @Volatile var instance: TrafficMonitorService? = null

        fun start(context: Context) {
            val intent = Intent(context, TrafficMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                @Suppress("DEPRECATION")
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrafficMonitorService::class.java))
        }

        private fun prefs(context: Context): SharedPreferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        private fun dayBucket(timestampMs: Long): Long = timestampMs / DAY_MS

        data class NetworkUsage(
            val packageName: String,
            val appName: String,
            val txBytes: Long,
            val rxBytes: Long,
        )

        /**
         * Sums the persisted per-day deltas for every package with at least one
         * bucket whose day starts at or after `sinceMs`'s day. Reads only —
         * safe to call whether or not the service is currently running (the
         * data survives the service being killed by the OS).
         */
        fun getUsageSince(context: Context, sinceMs: Long): List<NetworkUsage> {
            val p = prefs(context)
            val knownBuckets = p.getStringSet(KEY_KNOWN_BUCKETS, emptySet()) ?: emptySet()
            val sinceDay = dayBucket(sinceMs)
            val pm = context.packageManager

            val totals = LinkedHashMap<String, LongArray>() // packageName -> [tx, rx]
            for (entry in knownBuckets) {
                // entry format: "<dayBucket>|<packageName>"
                val sep = entry.indexOf('|')
                if (sep <= 0) continue
                val day = entry.substring(0, sep).toLongOrNull() ?: continue
                if (day < sinceDay) continue
                val packageName = entry.substring(sep + 1)
                val tx = p.getLong(KEY_BUCKET_TX_PREFIX + entry, 0L)
                val rx = p.getLong(KEY_BUCKET_RX_PREFIX + entry, 0L)
                val acc = totals.getOrPut(packageName) { longArrayOf(0L, 0L) }
                acc[0] += tx
                acc[1] += rx
            }

            return totals.map { (packageName, bytes) ->
                NetworkUsage(
                    packageName = packageName,
                    appName = appLabel(pm, packageName),
                    txBytes = bytes[0],
                    rxBytes = bytes[1],
                )
            }
        }

        private fun appLabel(pm: PackageManager, packageName: String): String {
            return try {
                val ai = pm.getApplicationInfo(packageName, 0)
                pm.getApplicationLabel(ai).toString()
            } catch (e: Exception) {
                packageName
            }
        }
    }

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
            pollThread = HandlerThread("TrafficMonitorPoller").also { t ->
                t.start()
                pollHandler = Handler(t.looper)
                // Sample immediately so a freshly started service has data
                // right away instead of waiting a full interval.
                pollHandler?.post(::poll)
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
                "Network usage tracking",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Tracks how much data each app transfers"
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
            .setContentTitle("Monitorização de rede")
            .setContentText("A medir o tráfego de dados por aplicação")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .build()
    }

    private fun poll() {
        if (!running.get()) return
        try {
            sample()
        } catch (e: Exception) {
            // A sampling failure (PackageManager binder death, prefs I/O error)
            // must never crash the poller — just skip this tick, same
            // resilience contract as AccessEventsService.poll().
            Log.w(TAG, "sample failed: ${e.message}")
        } finally {
            if (running.get()) pollHandler?.postDelayed(::poll, POLL_INTERVAL_MS)
        }
    }

    private fun sample() {
        val ctx = this
        val pm = ctx.packageManager
        val p = prefs(ctx)
        val now = System.currentTimeMillis()
        val bucket = dayBucket(now)

        val apps = try {
            pm.getInstalledApplications(0)
        } catch (e: Exception) {
            return
        }

        val editor = p.edit()
        val knownBuckets = (p.getStringSet(KEY_KNOWN_BUCKETS, emptySet()) ?: emptySet()).toMutableSet()

        // De-dupe by uid: several packages can share a uid (shared-user apps);
        // TrafficStats.getUidTxBytes is per-UID, so charging the delta to every
        // package under that uid would double count it. We attribute the whole
        // uid's delta to the first package name PackageManager reports for it,
        // which mirrors how the OS's own Data Usage screen groups shared-uid
        // apps under one entry.
        val seenUids = HashSet<Int>()

        for (appInfo in apps) {
            val uid = appInfo.uid
            if (!seenUids.add(uid)) continue

            val tx = TrafficStats.getUidTxBytes(uid)
            val rx = TrafficStats.getUidRxBytes(uid)
            // TrafficStats.UNSUPPORTED (-1) — this device/kernel doesn't expose
            // per-uid stats; nothing to sample for this app.
            if (tx < 0 && rx < 0) continue

            val lastTxKey = KEY_LAST_TX_PREFIX + uid
            val lastRxKey = KEY_LAST_RX_PREFIX + uid
            val previousTx = p.getLong(lastTxKey, -1L)
            val previousRx = p.getLong(lastRxKey, -1L)

            val deltaTx = if (tx >= 0) NetworkUsageCalculator.computeDelta(previousTx, tx) else 0L
            val deltaRx = if (rx >= 0) NetworkUsageCalculator.computeDelta(previousRx, rx) else 0L

            if (tx >= 0) editor.putLong(lastTxKey, tx)
            if (rx >= 0) editor.putLong(lastRxKey, rx)

            if (deltaTx == 0L && deltaRx == 0L) continue

            val bucketKey = "$bucket|${appInfo.packageName}"
            knownBuckets.add(bucketKey)
            val prevBucketTx = p.getLong(KEY_BUCKET_TX_PREFIX + bucketKey, 0L)
            val prevBucketRx = p.getLong(KEY_BUCKET_RX_PREFIX + bucketKey, 0L)
            editor.putLong(KEY_BUCKET_TX_PREFIX + bucketKey, prevBucketTx + deltaTx)
            editor.putLong(KEY_BUCKET_RX_PREFIX + bucketKey, prevBucketRx + deltaRx)
        }

        editor.putStringSet(KEY_KNOWN_BUCKETS, knownBuckets)
        editor.apply()
    }
}
