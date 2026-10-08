package com.littlegarden.app

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.littlegarden.app.data.model.*
import com.littlegarden.app.data.repository.GardenRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class GardenUiState(
    val data: GardenData = GardenData(), val today: LocalDate = LocalDate.now(),
    val loaded: Boolean = false, val readError: String? = null, val saveError: String? = null,
    val busy: Boolean = false, val answers: List<Int> = List(4) { -1 }, val note: String = "", val step: Int = 0,
    val reaction: PlantReaction? = null, val reactionId: Long = 0, val feedback: String = ""
) { val record get() = data.today(today) }
class GardenViewModel(private val repository: GardenRepository, private val saved: SavedStateHandle, private val now: () -> LocalDate = { LocalDate.now() }) : ViewModel() {
    private val mutable = MutableStateFlow(GardenUiState(today = now()))
    val state = mutable.asStateFlow()
    private var reader: Job? = null
    init { retryRead() }
    fun retryRead() {
        reader?.cancel()
        mutable.update { it.copy(readError = null) }
        reader = viewModelScope.launch {
            try { repository.data.collect { data -> refreshDay(); mutable.update { it.copy(data = data, loaded = true, readError = null) } } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(loaded = false, readError = "기록을 불러오지 못했어요. 기존 기록은 그대로 보관하고 있어요.") } }
        }
    }
    fun refreshDay() {
        if (mutable.value.today != now()) {
            mutable.update { it.copy(today = now(), reaction = null, feedback = "", step = 0, answers = List(4) { -1 }, note = "") }
            saved.remove<String>("draftDay")
        }
    }
    fun beginCheckin() {
        refreshDay()
        val s = mutable.value
        val isDraft = saved.get<String>("draftDay") == s.today.toString()
        val answers = if (isDraft) saved.get<ArrayList<Int>>("answers")?.toList() else s.record?.answers
        mutable.update { it.copy(answers = answers?.takeIf { a -> a.size == 4 } ?: List(4) { -1 }, note = if (isDraft) saved["note"] ?: "" else s.record?.note.orEmpty(), step = if (isDraft) (saved.get<Int>("step") ?: 0).coerceIn(0, 4) else 0, saveError = null, reaction = null, feedback = "") }
    }
    private fun saveDraft() { val s=mutable.value; saved["draftDay"]=s.today.toString(); saved["answers"]=ArrayList(s.answers); saved["note"]=s.note; saved["step"]=s.step }
    fun choose(index: Int) { val s=mutable.value; if (s.busy || s.step !in 0..3 || index !in GardenContent.questions[s.step].options.indices) return; mutable.update { it.copy(answers = it.answers.toMutableList().apply { this[s.step] = index }, saveError = null) }; saveDraft() }
    fun next() { val s=mutable.value; if (!s.busy && s.step in 0..3 && s.answers[s.step] >= 0) { mutable.update { it.copy(step = it.step + 1) }; saveDraft() } }
    fun previous(): Boolean { if (mutable.value.step <= 0) return false; mutable.update { it.copy(step = it.step - 1) }; saveDraft(); return true }
    fun note(value: String) { if (!mutable.value.busy) { mutable.update { it.copy(note = value.take(120)) }; saveDraft() } }
    private fun write(block: suspend () -> GardenData, after: (GardenData) -> Unit = {}) {
        if (mutable.value.busy || !mutable.value.loaded || mutable.value.readError != null) return
        mutable.update { it.copy(busy = true, saveError = null) }
        viewModelScope.launch {
            try { val data=block(); mutable.update { it.copy(data=data,busy=false) }; after(data) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(busy=false,saveError="저장하지 못했어요. 입력한 내용은 유지했으니 다시 시도해 주세요.") } }
        }
    }
    fun finishOnboarding(done: () -> Unit) = write({ repository.finishOnboarding() }) { done() }
    fun saveCheckin(skipNote: Boolean, done: () -> Unit) {
        val s=mutable.value
        if (now()!=s.today) { refreshDay(); mutable.update { it.copy(saveError="날짜가 바뀌었어요. 오늘의 나를 다시 살펴볼까요?") }; return }
        if (!DailyRecord.validAnswers(s.answers)) return
        val first=s.record==null
        write({ repository.saveCheckin(s.today,s.answers,if(skipNote) "" else s.note) }) {
            saved.remove<String>("draftDay")
            mutable.update { it.copy(reaction=if(first) PlantReaction.Growth else null,reactionId=it.reactionId+1,feedback="오늘의 나를 살펴봤어요.") }
            // A disk commit may span midnight. Keep yesterday's record, but do not open today's care.
            refreshDay()
            if(mutable.value.record!=null && mutable.value.today==s.today) done()
        }
    }
    fun complete(action: CareAction) {
        refreshDay()
        val s=mutable.value; val record=s.record ?: return
        if(action in record.completedCare) return
        write({ repository.completeCare(s.today,action) }) { data ->
            val all=data.today(s.today)?.allCareComplete==true
            mutable.update { it.copy(reaction=if(all) PlantReaction.Complete else PlantReaction.Care,reactionId=it.reactionId+1,feedback=if(all) "오늘의 나를 위해 세 가지를 해냈어요." else "오늘 나를 조금 돌봤어요.") }
        }
    }
    fun reactionConsumed(id: Long) { mutable.update { if(it.reactionId==id) it.copy(reaction=null) else it } }
    fun setReduceMotion(value: Boolean) = write({ repository.setReduceMotion(value) })
}


