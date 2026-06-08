'use client';

import { useState } from 'react';
import type { Source, SourceType, SourcePriority } from '@/lib/types';

interface ScanStats {
  sourcesScanned: number;
  totalLinks: number;
  filtered: number;
}

interface SourcesPanelProps {
  sources: Source[];
  newCandidateCount: number;
  scanning: boolean;
  scanStats: ScanStats | null;
  scanError: string | null;
  onAdd: (seed: Omit<Source, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onScan: () => void;
}

const TYPE_LABELS: Record<SourceType, string> = {
  competitor: 'Конкурент',
  tender: 'Тендеры',
  regulation: 'Регуляторика',
  media: 'СМИ',
  material: 'Материалы',
  supplier: 'Поставщик',
  other: 'Прочее',
};

const TYPE_COLORS: Record<SourceType, string> = {
  competitor: 'bg-red-100 text-red-700',
  tender: 'bg-blue-100 text-blue-700',
  regulation: 'bg-purple-100 text-purple-700',
  media: 'bg-gray-100 text-gray-600',
  material: 'bg-green-100 text-green-700',
  supplier: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
};

const PRIORITY_DOT: Record<SourcePriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-gray-300',
};

const SOURCE_TYPES: SourceType[] = ['competitor', 'tender', 'regulation', 'media', 'material', 'supplier', 'other'];
const PRIORITIES: SourcePriority[] = ['high', 'medium', 'low'];

const EMPTY_FORM = { name: '', url: '', type: 'other' as SourceType, priority: 'medium' as SourcePriority };

export default function SourcesPanel({
  sources, newCandidateCount, scanning, scanStats, scanError, onAdd, onDelete, onToggle, onScan,
}: SourcesPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!form.name.trim()) { setFormError('Введите название'); return; }
    if (!form.url.trim()) { setFormError('Введите URL'); return; }
    try { new URL(form.url.trim()); } catch { setFormError('Некорректный URL'); return; }
    onAdd({ name: form.name.trim(), url: form.url.trim(), type: form.type, priority: form.priority, active: true });
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(false);
  };

  const activeSources = sources.filter(s => s.active);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Источники</h2>
          <p className="text-xs text-gray-400 mt-0.5">{activeSources.length} активных из {sources.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onScan}
            disabled={scanning || activeSources.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Сканирование...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Проверить источники
              </>
            )}
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(null); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Добавить
          </button>
        </div>
      </div>

      {/* Scan stats */}
      {scanStats && !scanning && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex flex-wrap gap-4">
          <span>Источников проверено: <strong>{scanStats.sourcesScanned}</strong></span>
          <span>Ссылок извлечено: <strong>{scanStats.totalLinks}</strong></span>
          <span>Прошло фильтр: <strong>{scanStats.filtered}</strong></span>
          {newCandidateCount > 0 && (
            <span className="text-blue-800 font-medium">Новых кандидатов добавлено: {newCandidateCount}</span>
          )}
        </div>
      )}

      {scanError && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-xs text-red-600">{scanError}</div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">Новый источник</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Название"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <input
              type="url"
              placeholder="https://..."
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as SourceType }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as SourcePriority }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p === 'high' ? 'Высокий' : p === 'medium' ? 'Средний' : 'Низкий'} приоритет</option>)}
            </select>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">Добавить</button>
            <button onClick={() => { setShowForm(false); setFormError(null); setForm(EMPTY_FORM); }} className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">Отмена</button>
          </div>
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">Источники не добавлены</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(source => (
            <div
              key={source.id}
              className={`bg-white border rounded-xl px-4 py-3.5 flex items-center gap-3 transition-opacity ${source.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
            >
              {/* Priority dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[source.priority]}`} title={source.priority} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">{source.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TYPE_COLORS[source.type]}`}>
                    {TYPE_LABELS[source.type]}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400 truncate max-w-[240px]">{source.url}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">Проверен: {formatDate(source.lastScannedAt)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onToggle(source.id)}
                  title={source.active ? 'Выключить' : 'Включить'}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${source.active ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${source.active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <button
                  onClick={() => onDelete(source.id)}
                  title="Удалить"
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
