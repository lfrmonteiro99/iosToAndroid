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
        val id = sbn.id.toString()
        val pkg = sbn.packageName
        val data = mapOf<String, Any?>(
            "id" to id,
            "packageName" to pkg,
            "title" to (extras.getCharSequence("android.title")?.toString() ?: ""),
            "text" to (extras.getCharSequence("android.text")?.toString() ?: ""),
            "time" to sbn.postTime,
            "isOngoing" to sbn.isOngoing
        )
        val iterator = activeNotifications.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry["id"] == id && entry["packageName"] == pkg) {
                iterator.remove()
            }
        }
        activeNotifications.add(0, data)
        while (activeNotifications.size > 50) {
            activeNotifications.removeAt(activeNotifications.size - 1)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val id = sbn.id.toString()
        val pkg = sbn.packageName
        val iterator = activeNotifications.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry["id"] == id && entry["packageName"] == pkg) {
                iterator.remove()
            }
        }
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
