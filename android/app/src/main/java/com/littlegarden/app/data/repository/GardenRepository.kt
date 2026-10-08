package com.littlegarden.app.data.repository

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.littlegarden.app.data.local.GardenCodec
import com.littlegarden.app.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate

private val Context.gardenStore by preferencesDataStore("little_garden_v1")
interface GardenRepository {
    val data: Flow<GardenData>
    suspend fun finishOnboarding(): GardenData
    suspend fun saveCheckin(day: LocalDate, answers: List<Int>, note: String): GardenData
    suspend fun completeCare(day: LocalDate, action: CareAction): GardenData
    suspend fun setReduceMotion(value: Boolean): GardenData
}
class LocalGardenRepository(private val store: androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>) : GardenRepository {
    constructor(context: Context) : this(context.applicationContext.gardenStore)
    private val key = stringPreferencesKey("garden_json_v1")
    override val data = store.data.map { GardenCodec.decode(it[key]) }
    private suspend fun update(transform: (GardenData) -> GardenData): GardenData {
        var saved: GardenData? = null
        store.edit { preferences ->
            val next = transform(GardenCodec.decode(preferences[key]))
            preferences[key] = GardenCodec.encode(next)
            saved = next
        }
        return checkNotNull(saved) // edit returns only after an atomic disk commit.
    }
    override suspend fun finishOnboarding() = update { it.copy(onboardingComplete = true) }
    override suspend fun saveCheckin(day: LocalDate, answers: List<Int>, note: String) = update { it.saveCheckin(day, answers, note) }
    override suspend fun completeCare(day: LocalDate, action: CareAction) = update { it.completeCare(day, action) }
    override suspend fun setReduceMotion(value: Boolean) = update { it.copy(reduceMotion = value) }
}


