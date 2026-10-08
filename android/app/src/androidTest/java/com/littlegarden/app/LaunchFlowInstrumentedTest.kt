package com.littlegarden.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.littlegarden.app.data.model.*
import org.junit.*
import java.time.LocalDate

class LaunchFlowInstrumentedTest {
    @get:Rule val ui=createEmptyComposeRule()
    private val repo get()=ApplicationProvider.getApplicationContext<TestGardenApplication>().repository
    private var scenario:ActivityScenario<MainActivity>?=null
    @Before fun resetFixture() { repo.data.value=GardenData(reduceMotion=true); repo.failWrites=false }
    @After fun close() { scenario?.close() }
    private fun launch() { scenario=ActivityScenario.launch(MainActivity::class.java); ui.waitForIdle(); ui.onNodeWithText("시작하기").assertIsDisplayed(); tap("시작하기") }
    private fun relaunch() { scenario!!.close(); launch() }
    private fun tap(text:String) { ui.onNodeWithText(text).performScrollTo().performClick(); ui.waitForIdle() }
    private fun assertHome() { ui.onNodeWithText("오늘의 정원").assertIsDisplayed(); ui.onNodeWithText("나의 일상 기록").assertDoesNotExist() }
    private fun record() {
        tap("나의 일상 기록하기")
        listOf("조금 뒤척였어요","낮음","평소와 비슷해요","잔잔해요").forEach { tap(it); tap("다음") }
        tap("한마디 없이 기록 완료")
    }
    private fun recorded(day:LocalDate=LocalDate.now())=GardenData(reduceMotion=true).saveCheckin(day,listOf(0,1,2,3),"")
    @Test fun freshLaunchShowsWelcomeThenHomeRegardlessOfSavedOnboarding() { launch(); assertHome(); ui.onNodeWithText("나의 일상 기록하기").assertExists() }
    @Test fun saveThenCareThenNewActivityStartsHome() {
        launch(); record(); ui.onNodeWithText("오늘의 작은 돌봄").assertIsDisplayed()
        relaunch(); assertHome(); ui.onNodeWithText("오늘의 작은 돌봄 보기").assertExists()
    }
    @Test fun recordedUserOpensCareOnlyByTappingHomeCta() {
        repo.data.value=recorded(); launch(); assertHome()
        ui.onNodeWithText("오늘의 작은 돌봄").assertDoesNotExist()
        tap("오늘의 작은 돌봄 보기"); ui.onNodeWithText("오늘의 작은 돌봄").assertIsDisplayed()
    }
    @Test fun completeReturnsHomeAndRelaunchKeepsHome() {
        repo.data.value=recorded(); launch(); tap("오늘의 작은 돌봄 보기")
        CareAction.entries.forEach { action ->
            ui.onNodeWithContentDescription("${action.title} 해볼게요").performScrollTo().performClick()
            ui.onNodeWithContentDescription("${action.title} 완료하기").performScrollTo().performClick(); ui.waitForIdle()
        }
        assertHome(); relaunch(); assertHome()
        tap("오늘의 작은 돌봄 다시보기")
        // Both CTA and title share a label on different routes; Home title must disappear.
        ui.onNodeWithText("오늘의 정원").assertDoesNotExist()
        ui.onNodeWithText("오늘의 작은 돌봄 다시보기").assertIsDisplayed()
    }
    @Test fun yesterdaysRecordDoesNotUnlockTodaysCare() {
        repo.data.value=recorded(LocalDate.now().minusDays(1)); launch(); assertHome()
        ui.onNodeWithText("나의 일상 기록하기").assertExists()
        ui.onNodeWithText("오늘의 작은 돌봄 보기").assertDoesNotExist()
    }
    @Test fun configurationRecreationPreservesQuestionAndSelection() {
        launch(); tap("나의 일상 기록하기"); tap("조금 뒤척였어요"); tap("다음"); tap("낮음")
        scenario!!.recreate(); ui.waitForIdle()
        ui.onNodeWithText("지금 에너지는 어떤가요?").assertIsDisplayed()
        ui.onNodeWithText("낮음").assertIsSelected()
    }
    @Test fun configurationRecreationPreservesCareButNewLaunchDoesNot() {
        repo.data.value=recorded(); launch(); tap("오늘의 작은 돌봄 보기")
        scenario!!.recreate(); ui.waitForIdle(); ui.onNodeWithText("오늘의 작은 돌봄").assertIsDisplayed()
        relaunch(); assertHome()
    }
    @Test fun failedSaveStaysInCheckin() {
        launch(); repo.failWrites=true; record()
        ui.onNodeWithText("오늘의 작은 돌봄").assertDoesNotExist()
        ui.onNodeWithText("나의 일상 기록").assertIsDisplayed()
        Assert.assertNull(repo.data.value.today(LocalDate.now()))
    }
}
