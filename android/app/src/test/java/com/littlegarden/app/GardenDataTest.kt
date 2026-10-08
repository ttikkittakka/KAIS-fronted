package com.littlegarden.app

import org.junit.Test
import org.junit.Assert.*
import com.littlegarden.app.data.local.GardenCodec
import com.littlegarden.app.data.model.*
import java.time.LocalDate
import java.io.IOException

class GardenDataTest {
    @Test fun domainContract() { DomainChecks.main(emptyArray()) }
    @Test fun diskRoundTripRestoresTodayHistoryCareAndPreferences() {
        val date=LocalDate.of(2026,10,7)
        val data=GardenData(onboardingComplete=true,reduceMotion=true)
            .saveCheckin(date.minusDays(3),listOf(3,4,3,4),"좋았어요")
            .saveCheckin(date,listOf(0,1,2,3),"조금 쉬어요\n🍀")
            .completeCare(date,CareAction.Water).completeCare(date,CareAction.Sky)
        assertEquals(data,GardenCodec.decode(GardenCodec.encode(data)))
    }
    @Test fun emptyInstallIsNotCompleted() { assertNull(GardenCodec.decode(null).today(LocalDate.now())) }
    @Test(expected=IOException::class) fun corruptDataIsNotSilentlyWiped() { GardenCodec.decode("not json") }
    @Test(expected=IOException::class) fun unsupportedVersionIsNotSilentlyWiped() { GardenCodec.decode("{\"version\":2}") }
}
