package com.iostoandroid.launcher

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationService : NotificationListenerService() {
    companion object {
        val activeNotifications = mutableListOf<Map<String, Any?>>()
        var instance: NotificationService? = null
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val notification = sbn.notification
        val extras = notification.extras
        val data = mapOf(
            "id" to sbn.id.toString(),
            "packageName" to sbn.packageName,
            "title" to (extras.getCharSequence("android.title")?.toString() ?: ""),
            "text" to (extras.getCharSequence("android.text")?.toString() ?: ""),
            "time" to sbn.postTime,
            "isOngoing" to sbn.isOngoing
        )
        activeNotifications.removeAll { it["id"] == data["id"] && it["packageName"] == data["packageName"] }
        activeNotifications.add(0, data)
        // Keep max 50
        if (activeNotifications.size > 50) {
            activeNotifications.subList(50, activeNotifications.size).clear()
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        activeNotifications.removeAll {
            it["id"] == sbn.id.toString() && it["packageName"] == sbn.packageName
        }
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
