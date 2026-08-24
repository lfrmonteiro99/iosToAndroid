package com.iostoandroid.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat

/**
 * Foreground service that detects "back tap" gestures (two or three sharp taps
 * on the device's back — iOS 14+ Back Tap) from the accelerometer and
 * gyroscope, classifies them with [TapClassifier], and emits an `onBackTap`
 * event to JS via [LauncherModule.emitEvent].
 *
 * Why a foreground service: sensor listening must survive the launcher being
 * in the background (the user taps the back of the phone to wake/act while
 * another app is on top), and Android 12+ kills background receivers/threads
 * that hold a wake lock without a visible notification. The notification is the
 * required user-visible signal that the tap detector is active.
 *
 * Manufacturer variation is handled two ways:
 *   1. We watch BOTH the accelerometer (linear jolt) and the gyroscope
 *      (angular jolt) — some OEMs surface a back tap far more on one than the
 *      other — and flag an impulse if EITHER crosses its threshold.
 *   2. The [TapClassifier] windows are the real disambiguation and are
 *      configurable per the user's sensitivity profile selected in JS.
 *
 * An impulse is a short-lived peak: we require the magnitude to rise above a
 * threshold and then fall back (debounced) before the next impulse can count,
 * so a single physical tap produces exactly one classifier push, not dozens of
 * samples.
 */
class TapSensorService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private val classifier = TapClassifier()

    // Last raw magnitude per sensor, for a simple high-pass impulse detector.
    private var lastAccelMag = GRAVITY
    private var lastGyroMag = 0f

    // Debounce: an impulse is "live" until the signal returns near baseline,
    // so we don't re-fire on the same physical tap's trailing samples.
    private var accelImpulseLive = false
    private var gyroImpulseLive = false

    // Coarse global debounce so two independent sensors firing microseconds
    // apart for the same tap don't double-count as two classifier pushes.
    @Volatile private var lastImpulseAtMs = 0L

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        startForeground(NOTIFICATION_ID, buildNotification())
        registerSensors()
    }

    private fun registerSensors() {
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        // SENSOR_DELAY_GAME (~50 Hz) is plenty for tap impulses and far lighter
        // than SENSOR_DELAY_FASTEST, which would burn battery for no gain here.
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        gyroscope?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> handleAccelerometer(event)
            Sensor.TYPE_GYROSCOPE -> handleGyroscope(event)
        }
    }

    private fun handleAccelerometer(event: SensorEvent) {
        val mag = magnitude(event.values)
        val delta = kotlin.math.abs(mag - lastAccelMag)
        lastAccelMag = mag

        if (!accelImpulseLive && delta > ACCEL_IMPULSE_DELTA) {
            accelImpulseLive = true
            reportImpulse()
        } else if (accelImpulseLive && delta < ACCEL_SETTLE_DELTA) {
            accelImpulseLive = false
        }
    }

    private fun handleGyroscope(event: SensorEvent) {
        val mag = magnitude(event.values)
        val delta = kotlin.math.abs(mag - lastGyroMag)
        lastGyroMag = mag

        if (!gyroImpulseLive && mag > GYRO_IMPULSE_MAG) {
            gyroImpulseLive = true
            reportImpulse()
        } else if (gyroImpulseLive && mag < GYRO_SETTLE_MAG) {
            gyroImpulseLive = false
        }
    }

    /** One physical tap → at most one classifier push (coarse debounce). */
    @Synchronized
    private fun reportImpulse() {
        val now = SystemClock.uptimeMillis()
        if (now - lastImpulseAtMs < IMPULSE_DEBOUNCE_MS) return
        lastImpulseAtMs = now

        val result = classifier.push(now) ?: return
        val bundle = android.os.Bundle().apply {
            putString("type", if (result.type == BackTapType.DOUBLE) "double" else "triple")
            putInt("count", result.count)
            putLongArray("taps", result.taps.toLongArray())
        }
        LauncherModule.emitEvent("onBackTap", bundle)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        try {
            sensorManager.unregisterListener(this)
        } catch (_: Exception) { /* best effort */ }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) { /* best effort */ }
        classifier.reset()
    }

    private fun magnitude(values: FloatArray): Float {
        var sum = 0f
        for (v in values) sum += v * v
        return kotlin.math.sqrt(sum)
    }

    private fun buildNotification(): Notification {
        createChannel()
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationCompat.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            NotificationCompat.Builder(this)
        }
        return builder
            .setContentTitle("iOS Launcher")
            .setContentText("A detetar toques na traseira do dispositivo")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Back Tap",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Deteção de toques na traseira do dispositivo"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        // Tracks whether the service is currently active. Set in onCreate /
        // onDestroy so the RN bridge (isTapDetectionRunning) can report real
        // state without re-querying the OS.
        @Volatile var isRunning: Boolean = false
            private set

        private const val CHANNEL_ID = "back_tap"
        private const val NOTIFICATION_ID = 6361

        // Accelerometer impulse: a back tap spikes linear acceleration well above
        // the resting ~9.8 m/s², so the per-sample |Δmagnitude| is the signal.
        // Threshold tuned for a mid-sensitivity profile; the classifier windows
        // (not this) are what the user's profile adjusts.
        private const val GRAVITY = 9.8f
        private const val ACCEL_IMPULSE_DELTA = 6.0f
        private const val ACCEL_SETTLE_DELTA = 2.0f
        private const val GYRO_IMPULSE_MAG = 2.5f
        private const val GYRO_SETTLE_MAG = 0.5f
        private const val IMPULSE_DEBOUNCE_MS = 80L

        fun start(context: Context) {
            val appContext = context.applicationContext
            val intent = Intent(appContext, TapSensorService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    appContext.startForegroundService(intent)
                } else {
                    @Suppress("DEPRECATION")
                    appContext.startService(intent)
                }
            } catch (_: Exception) { /* missing permission / unavailable */ }
        }

        fun stop(context: Context) {
            val appContext = context.applicationContext
            try {
                appContext.stopService(Intent(appContext, TapSensorService::class.java))
            } catch (_: Exception) { /* not running */ }
        }
    }
}
