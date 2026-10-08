package com.littlegarden.app

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import com.littlegarden.app.data.model.*
import com.littlegarden.app.data.repository.GardenRepository
import kotlinx.coroutines.flow.MutableStateFlow
import java.time.LocalDate

/** Instrumentation only; never seeds or clears the installed user's DataStore. */
class TestGardenRepository : GardenRepository {
    override val data=MutableStateFlow(GardenData(reduceMotion=true))
    var failWrites=false
    private fun change(f:(GardenData)->GardenData):GardenData {
        check(!failWrites) { "Simulated disk failure" }
        data.value=f(data.value); return data.value
    }
    override suspend fun finishOnboarding()=change { it.copy(onboardingComplete=true) }
    override suspend fun saveCheckin(day:LocalDate,answers:List<Int>,note:String)=change { it.saveCheckin(day,answers,note) }
    override suspend fun completeCare(day:LocalDate,action:CareAction)=change { it.completeCare(day,action) }
    override suspend fun setReduceMotion(value:Boolean)=change { it.copy(reduceMotion=value) }
}
class TestGardenApplication : GardenApplication() {
    override val repository=TestGardenRepository()
}
class GardenTestRunner : AndroidJUnitRunner() {
    override fun newApplication(cl:ClassLoader?,className:String?,context:Context?):Application =
        super.newApplication(cl,TestGardenApplication::class.java.name,context)
}
