'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAuthClient } from '../../lib/supabase/auth-client';
import { appStorage } from '../app-storage';
import {
  DEFAULT_REMINDERS, PERIODS, PLANT_IDS, displayNameSchema, medicineSchema, profileSchema, remindersSchema,
  type GardenProfile, type Medicine, type MedicineInput, type PlantId, type Reminders,
} from '../personal-garden';
import { MedicationAlerts } from './MedicationAlerts';

const local = {
  profile: 'little-garden.personal-profile.v1',
  medications: 'little-garden.medications.v1',
  reminders: 'little-garden.medication-alerts.v1',
  names: 'little-garden.pot-names.v1',
};
const table = {
  profiles: 'onestep_user_profiles',
  medications: 'onestep_user_medications',
  names: 'onestep_pot_names',
};
type GardenData = {
  profile: GardenProfile | null;
  medications: Medicine[];
  reminders: Reminders;
  names: Partial<Record<PlantId, string>>;
};
const empty: GardenData = { profile: null, medications: [], reminders: DEFAULT_REMINDERS, names: {} };

function parseProfile(value: unknown) {
  return value === undefined || value === null ? null : profileSchema.parse(value);
}

function parseMedications(rows: { id: string; details: unknown }[]): Medicine[] {
  return rows.map(row => ({ ...medicineSchema.parse(row.details), id: row.id }));
}

function read<T>(key: string, fallback: T): T {
  const raw = appStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw) as T;
}

async function loadData(userId: string | null, signal: AbortSignal): Promise<GardenData> {
  if (!userId) {
    const names = read<Partial<Record<PlantId, string>>>(local.names, {});
    return {
      profile: parseProfile(read(local.profile, null)),
      medications: parseMedications(read<Medicine[]>(local.medications, []).map(({ id, ...details }) => ({ id, details }))),
      reminders: remindersSchema.parse(read(local.reminders, DEFAULT_REMINDERS)),
      names: Object.fromEntries(PLANT_IDS.flatMap(id => names[id] ? [[id, displayNameSchema.parse(names[id])]] : [])),
    };
  }
  const client = getAuthClient();
  if (!client) throw new Error('account-unavailable');
  const [profile, medicines, names] = await Promise.all([
    client.from(table.profiles).select('survey,reminders').eq('user_id', userId).abortSignal(signal).maybeSingle(),
    client.from(table.medications).select('id,details').eq('user_id', userId).order('id').abortSignal(signal),
    client.from(table.names).select('plant_id,name').eq('user_id', userId).abortSignal(signal),
  ]);
  if (profile.error || medicines.error || names.error) throw new Error('personal-read-failed');
  return {
    profile: parseProfile(profile.data?.survey),
    reminders: remindersSchema.parse(profile.data?.reminders ?? DEFAULT_REMINDERS),
    medications: parseMedications(medicines.data ?? []),
    names: Object.fromEntries((names.data ?? []).filter(row => PLANT_IDS.includes(row.plant_id))
      .map(row => [row.plant_id, displayNameSchema.parse(row.name)])),
  };
}

type PersonalGarden = GardenData & {
  ready: boolean;
  error: boolean;
  signedIn: boolean;
  reload: () => void;
  saveProfile: (profile: GardenProfile) => Promise<void>;
  saveMedicine: (id: string, input: MedicineInput) => Promise<void>;
  removeMedicine: (id: string) => Promise<void>;
  saveReminders: (reminders: Reminders) => Promise<void>;
  saveName: (plant: PlantId, value: string) => Promise<void>;
};
const PersonalGardenContext = createContext<PersonalGarden | null>(null);
export const usePersonalGarden = () => useContext(PersonalGardenContext);

export function PersonalGardenProvider({ userId = null, children }: { userId?: string | null; children: ReactNode }) {
  const [data, setData] = useState<GardenData>(empty);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadData(userId, controller.signal).then(next => {
      if (!controller.signal.aborted) { setData(next); setStatus('ready'); }
    }, () => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [userId, version]);

  function assertReady() {
    if (status !== 'ready') throw new Error('개인 설정을 먼저 불러와 주세요.');
  }

  function client() {
    const sdk = getAuthClient();
    if (!sdk) throw new Error('계정에 연결하지 못했어요.');
    return sdk;
  }

  async function saveProfile(profile: GardenProfile) {
    assertReady();
    const survey = profileSchema.parse(profile);
    if (userId) {
      const { error } = await client().from(table.profiles).upsert({ user_id: userId, survey }, { defaultToNull: false });
      if (error) throw new Error('설문을 저장하지 못했어요.');
    } else appStorage.setItem(local.profile, JSON.stringify(survey));
    setData(current => ({ ...current, profile: survey }));
  }

  async function saveReminders(settings: Reminders) {
    assertReady();
    const reminders = remindersSchema.parse(settings);
    if (userId) {
      const { error } = await client().from(table.profiles).upsert({ user_id: userId, reminders }, { defaultToNull: false });
      if (error) throw new Error('알림 시간을 저장하지 못했어요.');
    } else appStorage.setItem(local.reminders, JSON.stringify(reminders));
    setData(current => ({ ...current, reminders }));
  }

  async function saveMedicine(id: string, input: MedicineInput) {
    assertReady();
    const details = medicineSchema.parse({ ...input, periods: PERIODS.filter(period => input.periods.includes(period)) });
    if (userId) {
      const { error } = await client().from(table.medications).upsert({ user_id: userId, id, details });
      if (error) throw new Error('약 정보를 저장하지 못했어요.');
    } else {
      const existing = read<Medicine[]>(local.medications, []);
      appStorage.setItem(local.medications, JSON.stringify([...existing.filter(row => row.id !== id), { id, ...details }]));
    }
    setData(current => ({ ...current, medications: [...current.medications.filter(row => row.id !== id), { id, ...details }] }));
  }

  async function removeMedicine(id: string) {
    assertReady();
    if (userId) {
      const { error } = await client().from(table.medications).delete().eq('user_id', userId).eq('id', id);
      if (error) throw new Error('약 정보를 지우지 못했어요.');
    } else appStorage.setItem(local.medications, JSON.stringify(read<Medicine[]>(local.medications, []).filter(row => row.id !== id)));
    setData(current => ({ ...current, medications: current.medications.filter(row => row.id !== id) }));
  }

  async function saveName(plant: PlantId, value: string) {
    assertReady();
    const name = displayNameSchema.parse(value);
    if (userId) {
      const { error } = await client().from(table.names).upsert({ user_id: userId, plant_id: plant, name });
      if (error) throw new Error('화분 이름을 저장하지 못했어요.');
    } else appStorage.setItem(local.names, JSON.stringify({ ...read(local.names, {}), [plant]: name }));
    setData(current => ({ ...current, names: { ...current.names, [plant]: name } }));
  }

  return <PersonalGardenContext.Provider value={{
    ...data, ready: status === 'ready', error: status === 'error', signedIn: !!userId,
    reload: () => { setStatus('loading'); setVersion(value => value + 1); },
    saveProfile, saveMedicine, removeMedicine, saveReminders, saveName,
  }}>
    {children}
    {status === 'ready' && <MedicationAlerts medications={data.medications} reminders={data.reminders}/>}
  </PersonalGardenContext.Provider>;
}
