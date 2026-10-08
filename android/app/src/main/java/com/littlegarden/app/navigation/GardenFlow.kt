package com.littlegarden.app.navigation

import com.littlegarden.app.data.model.DailyRecord

/** Daily progress chooses a user action, never the initial destination or plant mood. */
enum class DailyRecordState { NOT_RECORDED, RECORDED, CARE_COMPLETED }
object GardenFlow {
    const val START="onboarding"
    const val HOME="home"
    const val CHECKIN="checkin"
    const val CARE="care"
    const val CARE_HISTORY="care_history"
    fun progress(record: DailyRecord?) = when {
        record==null -> DailyRecordState.NOT_RECORDED
        record.allCareComplete -> DailyRecordState.CARE_COMPLETED
        else -> DailyRecordState.RECORDED
    }
    fun homeAction(record: DailyRecord?) = when(progress(record)) {
        DailyRecordState.NOT_RECORDED -> CHECKIN
        DailyRecordState.RECORDED -> CARE
        DailyRecordState.CARE_COMPLETED -> CARE_HISTORY
    }
    fun homeLabel(record: DailyRecord?) = when(progress(record)) {
        DailyRecordState.NOT_RECORDED -> "나의 일상 기록하기"
        DailyRecordState.RECORDED -> "오늘의 작은 돌봄 보기"
        DailyRecordState.CARE_COMPLETED -> "오늘의 작은 돌봄 다시보기"
    }
    fun allowedDestination(requested: String, record: DailyRecord?): String = when {
        requested !in setOf(CARE,CARE_HISTORY) -> requested
        record==null -> CHECKIN
        requested==CARE_HISTORY && !record.allCareComplete -> CARE
        else -> requested
    }
    fun restoreTransientUi(hasSavedState: Boolean, hasRetainedActivity: Boolean) = hasSavedState && hasRetainedActivity
}
