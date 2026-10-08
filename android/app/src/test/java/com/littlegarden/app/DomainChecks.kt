package com.littlegarden.app

import com.littlegarden.app.data.model.*
import java.time.LocalDate

/** Runs the real domain model without an Android SDK or a replacement implementation. */
object DomainChecks {
    @JvmStatic fun main(args: Array<String>) {
        val day=LocalDate.of(2026,10,7)
        var checks=0
        fun verify(label: String, test: ()->Boolean) { check(test()) { label }; println("PASS: $label"); checks++ }
        val empty=GardenData()
        verify("Unrecorded day cannot open care") { empty.today(day)==null && runCatching { empty.completeCare(day,CareAction.Water) }.isFailure }
        verify("Incomplete and out-of-range answers rejected") { !DailyRecord.validAnswers(listOf(0,1,2)) && !DailyRecord.validAnswers(listOf(4,0,0,0)) && !DailyRecord.validAnswers(listOf(-1,0,0,0)) }
        val low=empty.saveCheckin(day,listOf(0,1,2,3),"있는 그대로")
        val good=empty.saveCheckin(day,listOf(3,4,3,4),"")
        verify("Mood follows recorded answers") { low.today(day)?.plantMood==PlantMood.Low && good.today(day)?.plantMood==PlantMood.Normal }
        verify("Growth is independent of mood") { low.recordedDays==good.recordedDays && low.recordedDays==1 }
        val water=low.completeCare(day,CareAction.Water)
        verify("Completion is idempotent") { water.completeCare(day,CareAction.Water)==water }
        val all=CareAction.entries.fold(low) { data,action -> data.completeCare(day,action) }
        verify("Three actions complete without overwriting mood") { all.today(day)?.allCareComplete==true && all.today(day)?.plantMood==PlantMood.Low }
        val edited=all.saveCheckin(day,listOf(3,4,3,4),"수정")
        verify("Editing retains care and does not duplicate growth") { edited.recordedDays==1 && edited.today(day)?.allCareComplete==true }
        verify("Midnight closes care while retaining history") { all.today(day.plusDays(1))==null && all.records[day]==all.today(day) && runCatching { all.completeCare(day.plusDays(1),CareAction.Sky) }.isFailure }
        val later=all.saveCheckin(day.plusDays(3),listOf(3,4,3,4),"")
        verify("Skipped days do not remove records or penalize mood") { later.recordedDays==2 && later.records[day]==all.records[day] && later.today(day.plusDays(3))?.plantMood==PlantMood.Normal }
        verify("Welcomes return after a break") { all.returningAfterBreak(day.plusDays(3)) && !all.returningAfterBreak(day.plusDays(1)) }
        verify("Original event names and durations retained") { PlantReaction.Complete.animation=="통통" && PlantReaction.Complete.durationMs==2350L && PlantReaction.Growth.animation=="new_leaf 뿅" }
        val flow=com.littlegarden.app.navigation.GardenFlow
        verify("New Activity never restores old care even with saved state") { !flow.restoreTransientUi(true,false) && !flow.restoreTransientUi(false,false) }
        verify("Configuration recreation retains transient UI") { flow.restoreTransientUi(true,true) }
        verify("Unrecorded Home CTA opens check-in") { flow.homeAction(empty.today(day))=="checkin" && flow.homeLabel(empty.today(day))=="나의 일상 기록하기" }
        verify("Recorded Home CTA opens care, regardless of mood") { flow.homeAction(low.today(day))=="care" && flow.homeAction(good.today(day))=="care" }
        verify("All completed uses separate review route") { flow.homeAction(all.today(day))=="care_history" && flow.homeLabel(all.today(day))=="오늘의 작은 돌봄 다시보기" }
        verify("Both care routes block missing today's record") { flow.allowedDestination("care",null)=="checkin" && flow.allowedDestination("care_history",null)=="checkin" }
        verify("Review cannot mislabel incomplete care") { flow.allowedDestination("care_history",water.today(day))=="care" }
        verify("New day resets CTA without deleting yesterday") { flow.homeAction(all.today(day.plusDays(1)))=="checkin" && all.today(day)!=null }
        verify("Just-saved care remains distinct from review even on an edited complete record") { flow.allowedDestination("care",edited.today(day))=="care" }
        println("$checks domain checks passed")
    }
}

