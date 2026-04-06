package com.iostoandroid.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class LauncherModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exception("React context is not available")

    override fun definition() = ModuleDefinition {
        Name("LauncherModule")

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
                } catch (e: Exception) {
                    ""
                }
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
            } else {
                false
            }
        }

        AsyncFunction("getAppIcon") { packageName: String ->
            try {
                val pm = context.packageManager
                val icon = pm.getApplicationIcon(packageName)
                drawableToBase64(icon)
            } catch (e: Exception) {
                ""
            }
        }

        AsyncFunction("isDefaultLauncher") {
            val pm = context.packageManager
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
            }
            val resolveInfo = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            resolveInfo?.activityInfo?.packageName == context.packageName
        }

        AsyncFunction("openLauncherSettings") {
            val intent = Intent(android.provider.Settings.ACTION_HOME_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }
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
