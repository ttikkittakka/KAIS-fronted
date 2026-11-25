import { localDay } from './daily-checkin';
import { PERIODS, PERIOD_LABELS, type Medicine, type Reminders } from './personal-garden';

export function enabledMedicationAlarms(medications: Medicine[], reminders: Reminders) {
  return PERIODS.flatMap(period => reminders[period].enabled && medications.some(medicine => medicine.periods.includes(period))
    ? [{ period, time: reminders[period].time }] : []);
}

export function medicationCalendar(medications: Medicine[], reminders: Reminders, now = new Date()) {
  const date = localDay(now).replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const times = new Set(enabledMedicationAlarms(medications, reminders).map(alarm => alarm.time));
  if (!times.size) return '';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Onestep Garden//Medication Reminders//KO', 'CALSCALE:GREGORIAN',
    ...Array.from(times).sort().flatMap(time => [
      'BEGIN:VEVENT', 'UID:medication-' + date + '-' + time.replace(':', '') + '@onestep-garden',
      'DTSTAMP:' + stamp, 'DTSTART:' + date + 'T' + time.replace(':', '') + '00', 'RRULE:FREQ=DAILY',
      'SUMMARY:복약 기록 확인', 'CLASS:PRIVATE', 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY',
      'DESCRIPTION:등록한 복약 기록을 확인해 주세요.', 'END:VALARM', 'END:VEVENT',
    ]), 'END:VCALENDAR', ''].join('\r\n');
}

export async function allowMedicationNotifications() {
  if (!window.isSecureContext || !('Notification' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/medication-alerts.js'); }
    catch { return 'unsupported'; }
  }
  return 'granted';
}

export async function showMedicationNotification(period: typeof PERIODS[number]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = PERIOD_LABELS[period] + ' 복약 알림';
  const options = { body: '정원에서 등록한 복약 일정을 확인해 주세요.', tag: 'garden-medication', icon: '/app-icon-192.png' };
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration?.active) await registration.showNotification(title, options);
  else new Notification(title, options);
}
