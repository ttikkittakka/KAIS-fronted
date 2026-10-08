package com.littlegarden.app.data.model

import java.time.LocalDate

data class Question(val title: String, val options: List<String>)
object GardenContent {
    val questions = listOf(
        Question("어젯밤 잠은 어땠나요?", listOf("많이 힘들었어요", "조금 뒤척였어요", "그냥 그래요", "괜찮게 잤어요")),
        Question("지금 에너지는 어떤가요?", listOf("매우 낮음", "낮음", "보통", "괜찮음", "충분함")),
        Question("오늘 식사는 어땠나요?", listOf("거의 못 먹었어요", "조금 먹었어요", "평소와 비슷해요", "든든하게 먹었어요")),
        Question("지금 기분은 어떤가요?", listOf("많이 지쳐요", "조금 무거워요", "잔잔해요", "괜찮아요", "가벼워요"))
    )
}
enum class CareAction(val id: String, val title: String, val description: String, val duration: String, val memory: String) {
    Water("water", "물 한 컵", "몸에 물을 조금 채워줘요.", "1분 · 아주 쉬움", "물을 마셨어요"),
    Sky("sky", "하늘 바라보기", "잠깐, 창밖에 눈을 쉬어줘요.", "2분 · 아주 쉬움", "하늘을 봤어요"),
    Walk("walk", "5분 걷기", "가까운 곳을 천천히 걸어요.", "5분 · 쉬움", "산책했어요")
}
enum class PlantMood { Normal, Low }
data class DailyRecord(
    val date: LocalDate,
    val answers: List<Int>,
    val note: String = "",
    val completedCare: Set<CareAction> = emptySet()
) {
    init { require(validAnswers(answers)); require(note.length <= 120) }
    val plantMood: PlantMood get() = if (answers.any { it < 2 }) PlantMood.Low else PlantMood.Normal
    val allCareComplete: Boolean get() = completedCare.size == CareAction.entries.size
    companion object {
        fun validAnswers(answers: List<Int>) = answers.size == 4 && answers.withIndex().all { (i, a) -> a in GardenContent.questions[i].options.indices }
    }
}
data class GardenData(val onboardingComplete: Boolean = false, val records: Map<LocalDate, DailyRecord> = emptyMap(), val reduceMotion: Boolean = false) {
    fun today(date: LocalDate) = records[date]
    val recordedDays: Int get() = records.size
    fun saveCheckin(date: LocalDate, answers: List<Int>, note: String): GardenData {
        val record = DailyRecord(date, answers.toList(), note, records[date]?.completedCare.orEmpty())
        return copy(records = records + (date to record))
    }
    fun completeCare(date: LocalDate, action: CareAction): GardenData {
        val record = records[date] ?: throw IllegalStateException("오늘의 나 기록을 먼저 완료해 주세요.")
        return copy(records = records + (date to record.copy(completedCare = record.completedCare + action)))
    }
    fun returningAfterBreak(today: LocalDate) = records.keys.maxOrNull()?.isBefore(today.minusDays(1)) == true
}
/** Presentation derives from the saved check-in; completion never rewrites mood. */
data class PlantPresentation(val mood: PlantMood, val energy: Int?, val leafState: String, val expression: String, val cloudSupported: Boolean, val recordedDays: Int) {
    companion object {
        fun from(data: GardenData, date: LocalDate): PlantPresentation {
            val record = data.today(date)
            val low = record?.plantMood == PlantMood.Low
            return PlantPresentation(record?.plantMood ?: PlantMood.Normal, record?.answers?.get(1), if (low) "low_energy" else "idle", if (low) "resting" else "calm", false, data.recordedDays)
        }
    }
}
enum class PlantReaction(val animation: String, val durationMs: Long) {
    Touch("touch", 1000), Care("잎만 통통", 1000), Complete("통통", 2350), Growth("new_leaf 뿅", 2250)
}
