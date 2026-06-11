'use client';

import type { StoredReport } from './reportTypes';

const REPORTS_KEY = 'trigger-radar-reports';
const MAX_REPORTS = 5;

export function loadReports(): StoredReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StoredReport[]).sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveReport(stored: StoredReport): void {
  try {
    const existing = loadReports();
    const updated = [stored, ...existing.filter(r => r.id !== stored.id)].slice(0, MAX_REPORTS);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
  } catch {}
}

export function deleteReport(id: string): void {
  try {
    const updated = loadReports().filter(r => r.id !== id);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
  } catch {}
}
