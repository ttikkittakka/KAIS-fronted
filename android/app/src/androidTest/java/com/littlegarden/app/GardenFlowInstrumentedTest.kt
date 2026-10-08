package com.littlegarden.app

import androidx.compose.ui.test.*
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.SavedStateHandle
import com.littlegarden.app.data.model.*
import com.littlegarden.app.data.repository.GardenRepository
import com.littlegarden.app.navigation.GardenApp
import com.littlegarden.app.ui.theme.GardenTheme
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

class GardenFlowInstrumentedTest {
    @get:Rule val ui=createComposeRule()
    private class Repo : GardenRepository {
        override val data=MutableStateFlow(GardenData(reduceMotion=true))
        private fun change(f:(GardenData)->GardenData):GardenData { data.value=f(data.value); return data.value }
        override suspend fun finishOnboarding()=change { it.copy(onboardingComplete=true) }
        override suspend fun saveCheckin(day:LocalDate,answers:List<Int>,note:String)=change { it.saveCheckin(day,answers,note) }
        override suspend fun completeCare(day:LocalDate,action:CareAction)=change { it.completeCare(day,action) }
        override suspend fun setReduceMotion(value:Boolean)=change { it.copy(reduceMotion=value) }
    }
    private fun tap(label:String) { ui.onNodeWithText(label).performScrollTo().performClick(); ui.waitForIdle() }
    private fun screenshot(name:String) {
        val image=ui.onRoot().captureToImage().asAndroidBitmap()
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val folder=context.getExternalFilesDir("qa") ?: error("No screenshot directory")
        folder.mkdirs()
        File(folder,"$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
    }
    @Test fun homeCheckinCareAndRecords() {
        val repo=Repo()
        lateinit var vm:GardenViewModel
        ui.runOnUiThread { vm=GardenViewModel(repo,SavedStateHandle()) }
        ui.setContent { GardenTheme { GardenApp(vm) } }
        ui.waitForIdle()
        screenshot("01-welcome"); tap("시작하기"); screenshot("02-home")
        ui.onNodeWithText("오늘의 작은 돌봄").assertDoesNotExist()
        tap("나의 일상 기록하기"); screenshot("03-checkin")
        listOf("조금 뒤척였어요","낮음","평소와 비슷해요","잔잔해요").forEach { tap(it); tap("다음") }
        tap("한마디 없이 기록 완료")
        ui.onNodeWithText("오늘의 작은 돌봄").assertIsDisplayed()
        screenshot("04-care")
        CareAction.entries.forEach { action ->
            ui.onNodeWithContentDescription("${action.title} 해볼게요").performScrollTo().performClick()
            ui.onNodeWithContentDescription("${action.title} 완료하기").performScrollTo().performClick()
            ui.waitForIdle()
        }
        ui.waitUntil { repo.data.value.today(LocalDate.now())?.allCareComplete==true }
        ui.onNodeWithText("오늘의 정원").assertIsDisplayed()
        ui.onNodeWithText("기록",useUnmergedTree=true).performClick()
        ui.onNodeWithText("나의 정원").assertIsDisplayed()
        screenshot("05-records")
        ui.runOnIdle { check(repo.data.value.recordedDays==1) }
    }
}


