import { appStorage } from './app-storage';
import { newLocalId } from './record-store';
import type { ContactTrend } from './mission-policy';

const KEY = 'little-garden.connections.v1';
const DAY = 86400_000;
const MAX_CONTACTS = 50;
export type Person = { id: string; name: string; phone: string; dates: number[] };
type Connections = { enabled: boolean; reminders: boolean; nextCheck: number; people: Person[] };
const initial: Connections = { enabled: false, reminders: false, nextCheck: 0, people: [] };

function phoneNumber(value: string) {
  const phone = value.trim().replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(phone) ? phone : '';
}

export function readConnections(now = Date.now()): Connections {
  try {
    const state = JSON.parse(appStorage.getItem(KEY) ?? 'null');
    if (!state || !Array.isArray(state.people)) return initial;
    return {
      enabled: state.enabled === true, reminders: state.reminders === true,
      nextCheck: Number.isFinite(state.nextCheck) ? state.nextCheck : 0,
      people: state.people.filter((person: Person) => person && typeof person.id === 'string' &&
        typeof person.name === 'string' && typeof person.phone === 'string' && !!phoneNumber(person.phone) && Array.isArray(person.dates))
        .slice(0, MAX_CONTACTS)
        .map((person: Person) => ({ ...person, dates: person.dates.filter(date => Number.isFinite(date) && date <= now && date > now - 90 * DAY).slice(0, 400) })),
    };
  } catch { return initial; }
}

function write(state: Connections) {
  appStorage.setItem(KEY, JSON.stringify(state));
  return state;
}

export function connectionOptions(patch: Partial<Pick<Connections, 'enabled' | 'reminders' | 'nextCheck'>>) {
  const next = { ...readConnections(), ...patch };
  return write({ ...next, reminders: next.enabled && next.reminders });
}

export function addPerson(name: string, raw: string) {
  const state = readConnections();
  const phone = phoneNumber(raw);
  name = name.trim().slice(0, 40);
  if (!state.enabled || !name || !phone) throw new Error('이름과 전화번호를 확인해 주세요.');
  if (state.people.some(person => person.phone === phone)) throw new Error('이미 저장한 연락처예요.');
  if (state.people.length >= MAX_CONTACTS) throw new Error('연락처는 50명까지 골라 둘 수 있어요.');
  return write({ ...state, people: [...state.people, { id: newLocalId(), name, phone, dates: [] }] });
}

export function recordContact(id: string, now = Date.now()) {
  const state = readConnections(now);
  if (!state.enabled || !state.people.some(person => person.id === id)) throw new Error('선택한 연락처가 없어요.');
  return write({ ...state, people: state.people.map(person => person.id === id && now - (person.dates.at(-1) ?? 0) > 60_000
    ? { ...person, dates: [...person.dates, now].slice(-400) } : person) });
}

export function removePerson(id: string) {
  const state = readConnections();
  return write({ ...state, people: state.people.filter(person => person.id !== id) });
}

export const clearConnections = () => write(initial);

export function contactTrend(people: Person[], now = Date.now()): ContactTrend {
  const dates = people.flatMap(person => person.dates);
  return {
    recent: Math.min(50, dates.filter(value => value > now - 7 * DAY && value <= now).length),
    previous: Math.min(50, dates.filter(value => value > now - 14 * DAY && value <= now - 7 * DAY).length),
  };
}

export function frequentPeople(people: Person[]) {
  return people.filter(person => person.dates.length > 0)
    .sort((a, b) => b.dates.length - a.dates.length || (b.dates.at(-1) ?? 0) - (a.dates.at(-1) ?? 0));
}

export function recentPeople(people: Person[]) {
  return people.filter(person => person.dates.length > 0)
    .sort((a, b) => (b.dates.at(-1) ?? 0) - (a.dates.at(-1) ?? 0));
}
