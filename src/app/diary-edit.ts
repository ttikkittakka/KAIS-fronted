import type { DailyCheckin } from './daily-checkin';
import { normalizeAnswers, QUESTIONS } from './questions';

export type DiaryEdit = { answers: string[]; note: string; photoComment: string; outing?: DailyCheckin['outing'] };

export function diaryEditValues(record: DailyCheckin): DiaryEdit {
  return { answers: normalizeAnswers(record.answers).map(answer => answer ?? ''), note: record.note, photoComment: record.photoComment ?? '', outing: record.outing };
}

export function validDiaryAnswers(answers: readonly string[]) {
  return answers.length === QUESTIONS.length &&
    QUESTIONS.every((question, index) => question.options.some(option => option.value === answers[index]));
}

export function sameDiaryEdit(a: DiaryEdit, b: DiaryEdit) {
  return a.answers.length === b.answers.length && a.answers.every((value, index) => value === b.answers[index]) &&
    a.note === b.note && a.photoComment === b.photoComment && a.outing === b.outing;
}
