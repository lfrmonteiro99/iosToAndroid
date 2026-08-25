package com.iostoandroid.health

import android.content.Context
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.LocalDate
import java.time.ZoneId

/**
 * Read-only, availability-gated Health Connect bridge.
 *
 * Health Connect is a separate installable app/service (bundled into the OS
 * from Android 14, a Play Store app before that), so it is absent on most
 * emulators and on plenty of real devices. Both functions therefore report
 * "unavailable"/"no data" instead of throwing: nothing in the app may depend on
 * Health Connect being present.
 */
class HealthConnectModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("HealthConnectModule")

    /**
     * true only when the Health Connect SDK reports SDK_AVAILABLE. Anything
     * else — SDK unavailable, provider update required, or an SDK that is not
     * present at all on this API level — is false.
     */
    AsyncFunction("isAvailable") {
      isSdkAvailable(appContext.reactContext ?: return@AsyncFunction false)
    }

    /**
     * Today's aggregated step total from Health Connect's StepsRecord, or null
     * when the read permission has not been granted, Health Connect is
     * unavailable, or there is no data for today. Never returns a fabricated 0:
     * a real 0 means "no steps", null means "no answer".
     */
    // `Coroutine`, not a plain lambda: getGrantedPermissions() and aggregate()
    // are both `suspend`, and a plain AsyncFunction body is not a coroutine
    // scope — it failed to compile with "Suspend function can only be called
    // from a coroutine or another suspend function". This is the same builder
    // expo-asset and expo-clipboard use for their suspending bodies. Note the
    // early-return label changes with it: return@Coroutine, not
    // return@AsyncFunction.
    AsyncFunction("getTodayStepsFromHealthConnect") Coroutine { ->
      val context = appContext.reactContext ?: return@Coroutine null
      if (!isSdkAvailable(context)) return@Coroutine null

      val client = HealthConnectClient.getOrCreate(context)
      val permission = HealthPermission.getReadPermission(StepsRecord::class)
      val granted = client.permissionController.getGrantedPermissions()
      if (!granted.contains(permission)) return@Coroutine null

      val zone = ZoneId.systemDefault()
      val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
      val now = java.time.Instant.now()

      val response = client.aggregate(
        AggregateRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
        )
      )
      response[StepsRecord.COUNT_TOTAL]?.toInt()
    }
  }

  /**
   * The Health Connect SDK requires API 26+; on older devices getSdkStatus is
   * not meaningful, so treat those as unavailable rather than calling into it.
   */
  private fun isSdkAvailable(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
  }
}
