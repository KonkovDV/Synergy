// Specialist report (JSON + CSV) and a calendar reminder (.ics) — no server, no account.
import { APP } from '../config.js';
import { SKILL_NAME } from '../core/vocabulary.js';
import { skillProfile } from '../core/progress.js';

export function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function buildReport(state) {
  const runs = state.runs.filter(r => !r.demo);
  return {
    app: APP.name, version: APP.version, exported_at: new Date().toISOString(),
    disclaimer: 'Тренажёр, не медицинское изделие. Метрики — игровые, без клинической валидации.',
    settings: { scheme: state.settings.scheme, source: state.settings.source, side: state.settings.side, sensitivity: state.settings.sensitivity, coThreshold: state.settings.coThreshold },
    calibration: state.calibrations,
    summary: { runs: runs.length, minutes: Math.round(state.profile.totals.seconds / 60), streak: state.profile.streak, skills: skillProfile(runs, 30) },
    runs,
  };
}

export function reportCsv(state) {
  const skills = Object.keys(SKILL_NAME);
  const head = ['date', 'game', 'level', 'scheme', 'source', 'retention', 'score', 'stars', 'duration_s', ...skills];
  const rows = state.runs.filter(r => !r.demo).map(r => [r.at, r.game, r.level, r.scheme, r.source, r.retention ? 1 : 0, r.score, r.stars, r.durationS, ...skills.map(s => r.skills?.[s] ?? '')]);
  return [head, ...rows].map(row => row.join(';')).join('\n');
}

export function reminderIcs(time = '19:00') {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synergy//Trainer//RU', 'BEGIN:VEVENT',
    `UID:synergy-${Date.now()}@local`, `DTSTART:${stamp}`, 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    'SUMMARY:Синергия: тренировка 10–15 минут', 'DESCRIPTION:Тренировка дня ждёт. Мышцам — короткие регулярные занятия.',
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Пора на тренировку', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
