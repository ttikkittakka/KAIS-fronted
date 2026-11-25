'use client';

import { useEffect, useState } from 'react';
import { appStorage } from '../app-storage';
import { localDay } from '../daily-checkin';
import { enabledMedicationAlarms, showMedicationNotification } from '../medication-alarms';
import { PERIOD_LABELS, type Medicine, type Period, type Reminders } from '../personal-garden';

const FIRED = 'little-garden.medication-alerts-fired.v1';

export function MedicationAlerts({ medications, reminders }: { medications: Medicine[]; reminders: Reminders }) {
  const [alert, setAlert] = useState<Period | null>(null);
  useEffect(() => {
    const enabled = enabledMedicationAlarms(medications, reminders);
    if (!enabled.length) return;
    let last = '';
    function check() {
      const now = new Date();
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const due = enabled.find(alarm => alarm.time === time);
      if (!due) return;
      const stamp = localDay(now) + 'T' + time;
      if (stamp === last) return;
      last = stamp;
      try {
        if (appStorage.getItem(FIRED) === stamp) return;
        appStorage.setItem(FIRED, stamp);
      } catch { /* Still show this tab's in-app reminder if browser storage is full. */ }
      setAlert(due.period);
      void showMedicationNotification(due.period).catch(() => {});
    }
    check();
    const timer = window.setInterval(check, 15000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [medications, reminders]);
  if (!alert) return null;
  return <aside className="install-toast medication-toast" role="status">
    <span>{PERIOD_LABELS[alert]} 복약 일정을 확인할 시간이에요.</span>
    <a href="#medications" onClick={() => setAlert(null)}>복약 관리</a>
    <button type="button" aria-label="복약 알림 닫기" onClick={() => setAlert(null)}>×</button>
  </aside>;
}
