'use client';

import { useState, useEffect } from 'react';
import type { TriggerEvent } from '@/lib/types';
import type { StoredReport, CorrelationSnapshot } from '@/lib/reportTypes';
import { loadReports, saveReport, deleteReport } from '@/lib/reportStorage';
import { buildCorrelationClusters } from './CorrelationEngine';
import ReportView from './ReportView';

interface ReportsPanelProps {
  activeEvents: TriggerEvent[];
  markedEvents: TriggerEvent[];
  onReportCountChange: (count: number) => void;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', attention: 'bg-amber-400', normal: 'bg-emerald-400',
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ReportsPanel({ activeEvents, markedEvents, onReportCountChange }: ReportsPanelProps) {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadReports();
    setReports(stored);
    if (stored.length > 0) setActiveId(stored[0].id);
    onReportCountChange(stored.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventsForReport = markedEvents.length > 0 ? markedEvents : activeEvents;
  const activeReport = reports.find(r => r.id === activeId) ?? null;

  const handleGenerate = async () => {
    if (generating || eventsForReport.length === 0) return;
    setGenerating(true);
    setGenerateError(null);

    // Build correlation snapshots from current active events
    const clusters = buildCorrelationClusters(activeEvents);
    const correlationSnapshots: CorrelationSnapshot[] = clusters.map(c => ({
      id: c.id,
      label: c.label,
      correlationType: c.correlationType,
      strength: c.strength,
      insight: c.insight,
      eventIds: c.events.map(e => e.id),
    }));

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsForReport, correlations: correlationSnapshots }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? 'Ошибка генерации');
        return;
      }

      const generatedAt = new Date().toISOString();
      const stored: StoredReport = {
        id: crypto.randomUUID(),
        title: `Отчёт ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        report: data.report,
        eventSnapshots: JSON.parse(JSON.stringify(eventsForReport)) as TriggerEvent[],
        correlationSnapshots,
        generatedAt,
        eventCount: eventsForReport.length,
      };

      saveReport(stored);
      const updated = loadReports();
      setReports(updated);
      setActiveId(stored.id);
      onReportCountChange(updated.length);
    } catch {
      setGenerateError('Сетевая ошибка при генерации отчёта.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteReport(id);
    const updated = loadReports();
    setReports(updated);
    onReportCountChange(updated.length);
    if (activeId === id) {
      setActiveId(updated.length > 0 ? updated[0].id : null);
    }
  };

  return (
    <div className="flex gap-6">
      {/* ── Left: generator + history ── */}
      <div className="w-52 flex-shrink-0 space-y-4">
        {/* Generator card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-900 mb-2">Новый отчёт</h3>
          <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg mb-3">
            <span className="text-xs text-gray-500">
              {markedEvents.length > 0 ? 'В брифе' : 'Все активные'}
            </span>
            <span className={`text-base font-bold ${eventsForReport.length > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
              {eventsForReport.length}
            </span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || eventsForReport.length === 0}
            className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Генерация...
              </>
            ) : 'Сформировать отчёт'}
          </button>
          {generateError && (
            <p className="mt-2 text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 leading-snug">
              {generateError}
            </p>
          )}
          {markedEvents.length === 0 && eventsForReport.length > 0 && (
            <p className="mt-2 text-[10px] text-gray-400 leading-snug">
              Пометьте события флажком «В бриф» для выборочного отчёта
            </p>
          )}
        </div>

        {/* History */}
        {reports.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              История
            </p>
            <div className="space-y-1">
              {reports.map(r => (
                <div
                  key={r.id}
                  className={`group flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    activeId === r.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveId(r.id)}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[r.report.reportSeverity] ?? 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-medium leading-snug ${activeId === r.id ? 'text-blue-700' : 'text-gray-700'}`}>
                      {r.title}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {r.eventCount} событий · {formatShortDate(r.generatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 leading-none pb-0.5"
                    aria-label="Удалить отчёт"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: report or empty state ── */}
      <div className="flex-1 min-w-0">
        {activeReport ? (
          <ReportView stored={activeReport} />
        ) : generating ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <svg className="animate-spin w-6 h-6 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-gray-700 mb-1">Формируется отчёт...</p>
            <p className="text-xs text-gray-400">
              Авангард Аналитика обрабатывает {eventsForReport.length} событий
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Отчётов пока нет</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
              Нажмите «Сформировать отчёт» — система создаст структурированный аналитический документ
              с источниками, уровнем уверенности и приоритетными действиями.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
