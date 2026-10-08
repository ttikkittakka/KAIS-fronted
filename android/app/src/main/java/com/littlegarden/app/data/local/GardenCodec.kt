package com.littlegarden.app.data.local

import com.littlegarden.app.data.model.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate

object GardenCodec {
    fun encode(data: GardenData): String = JSONObject().apply {
        put("version", 1)
        put("onboardingComplete", data.onboardingComplete)
        put("reduceMotion", data.reduceMotion)
        put("records", JSONArray().apply {
            data.records.toSortedMap().values.forEach { record -> put(JSONObject().apply {
                put("date", record.date.toString())
                put("answers", JSONArray(record.answers))
                put("note", record.note)
                put("plantState", record.plantMood.name)
                put("completedCareIds", JSONArray(record.completedCare.map { it.id }))
            }) }
        })
    }.toString()
    fun decode(raw: String?): GardenData {
        if (raw == null) return GardenData()
        try {
            val root = JSONObject(raw)
            require(root.getInt("version") == 1)
            val entries = root.getJSONArray("records")
            val records = (0 until entries.length()).map { i ->
                val value = entries.getJSONObject(i)
                val answers = value.getJSONArray("answers")
                val care = value.getJSONArray("completedCareIds")
                DailyRecord(LocalDate.parse(value.getString("date")), List(answers.length()) { answers.getInt(it) }, value.getString("note"),
                    (0 until care.length()).map { index -> CareAction.entries.first { it.id == care.getString(index) } }.toSet())
            }
            require(records.map { it.date }.distinct().size == records.size)
            return GardenData(root.getBoolean("onboardingComplete"), records.associateBy { it.date }, root.optBoolean("reduceMotion", false))
        } catch (error: Exception) {
            // Fail closed: never replace unreadable existing records with an empty garden.
            throw IOException("저장된 기록을 읽지 못했어요. 기존 데이터는 그대로 보관합니다.", error)
        }
    }
}
