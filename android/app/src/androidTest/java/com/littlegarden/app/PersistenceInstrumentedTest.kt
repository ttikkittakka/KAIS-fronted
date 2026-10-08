package com.littlegarden.app

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.platform.app.InstrumentationRegistry
import com.littlegarden.app.data.model.*
import com.littlegarden.app.data.repository.LocalGardenRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Test
import org.junit.Assert.*
import java.io.File
import java.time.LocalDate
import java.util.UUID

class PersistenceInstrumentedTest {
    @Test fun diskSurvivesStoreRecreationAndChangesDay() = runBlocking {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val file=File(context.cacheDir,"test-${UUID.randomUUID()}.preferences_pb")
        var scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
        try {
            val day=LocalDate.of(2026,10,7)
            var repo=LocalGardenRepository(PreferenceDataStoreFactory.create(scope=scope,produceFile={file}))
            repo.finishOnboarding()
            repo.saveCheckin(day,listOf(0,1,2,3),"오늘도 안부")
            repo.completeCare(day,CareAction.Water)
            scope.coroutineContext[Job]!!.cancelAndJoin()
            scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
            repo=LocalGardenRepository(PreferenceDataStoreFactory.create(scope=scope,produceFile={file}))
            val restored=repo.data.first()
            assertTrue(restored.onboardingComplete)
            assertEquals(setOf(CareAction.Water),restored.today(day)!!.completedCare)
            assertEquals(PlantMood.Low,restored.today(day)!!.plantMood)
            assertNull(restored.today(day.plusDays(1)))
            assertEquals("오늘도 안부",restored.records[day]!!.note)
        } finally { scope.coroutineContext[Job]!!.cancelAndJoin(); file.delete() }
    }
}
