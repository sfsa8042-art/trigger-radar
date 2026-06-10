'use client';

import { useState, useEffect, useRef } from 'react';
import type { TriggerEvent, EventCategory, Source, Candidate } from '@/lib/types';
import { buildDefaultSources } from '@/lib/defaultSources';
import { archiveExpiredEvents, isActive } from '@/lib/eventLifecycle';
import EventCard from './EventCard';
import SourcesPanel from './SourcesPanel';
import CandidateInbox from './CandidateInbox';
import AnalyticsPanel from './AnalyticsPanel';

const EVENTS_KEY = 'trigger-radar-events';
const SOURCES_KEY = 'trigger-radar-sources';
const CANDIDATES_KEY = 'trigger-radar-candidates';

type Tab = 'events' | 'sources' | 'candidates' | 'analytics';
type FilterType = 'all' | 'marked' | EventCategory;
type StatusFilter = 'active' | 'archived' | 'all';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'marked', label: 'В бриф' },
  { value: 'news', label: 'Новости' },
  { value: 'tender', label: 'Тендеры' },
  { value: 'competitor', label: 'Конкуренты' },
  { value: 'regulation', label: 'Регуляторика' },
  { value: 'other', label: 'Прочее' },
];

interface SourceScanStat {
  sourceName: string;
  extractedLinks: number;
  positiveMatches: number;
  afterNegativeFilter: number;
  finalCandidates: number;
  error?: string;
}

interface ScanStats {
  sourcesScanned: number;
  totalLinks: number;
  filtered: number;
  perSource?: SourceScanStat[];
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export default function TriggerRadar() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>('events');

  // Events state
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [justArchivedCount, setJustArchivedCount] = useState(0);
  const [brief, setBrief] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sources state
  const [sources, setSources] = useState<Source[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanNewCount, setLastScanNewCount] = useState(0);

  // Candidates state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    const raw = loadJson<TriggerEvent[]>(EVENTS_KEY) ?? [];
    const storedCandidates = loadJson<Candidate[]>(CANDIDATES_KEY) ?? [];
    let storedSources = loadJson<Source[]>(SOURCES_KEY);
    if (!storedSources) {
      storedSources = buildDefaultSources();
      saveJson(SOURCES_KEY, storedSources);
    }

    // Archive expired events on startup (also patches missing expiresAt for old events)
    const { updated, archivedCount } = archiveExpiredEvents(raw);
    if (archivedCount > 0) {
      saveJson(EVENTS_KEY, updated);
      setJustArchivedCount(archivedCount);
    }

    setEvents(updated);
    setSources(storedSources);
    setCandidates(storedCandidates);
    setHydrated(true);
  }, []);

  // Events helpers
  const persistEvents = (updated: TriggerEvent[]) => {
    setEvents(updated);
    saveJson(EVENTS_KEY, updated);
  };

  const persistSources = (updated: Source[]) => {
    setSources(updated);
    saveJson(SOURCES_KEY, updated);
  };

  const persistCandidates = (updated: Candidate[]) => {
    setCandidates(updated);
    saveJson(CANDIDATES_KEY, updated);
  };

  const handleAnalyze = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Ошибка анализа'); return; }
      persistEvents([data as TriggerEvent, ...events]);
      setUrl('');
      inputRef.current?.focus();
    } catch {
      setError('Сетевая ошибка. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMark = (id: string) =>
    persistEvents(events.map(e => (e.id === id ? { ...e, markedForBrief: !e.markedForBrief } : e)));

  const deleteEvent = (id: string) =>
    persistEvents(events.filter(e => e.id !== id));

  const handleGenerateBrief = async () => {
    // Only active events go into the brief — archived ones are silently excluded
    const marked = events.filter(e => e.markedForBrief && isActive(e));
    if (marked.length === 0 || generatingBrief) return;
    setGeneratingBrief(true);
    setBrief(null);
    setBriefError(null);
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: marked }),
      });
      const data = await res.json();
      if (!res.ok) { setBriefError(data.error ?? 'Ошибка генерации брифа'); return; }
      setBrief(data.brief);
    } catch {
      setBriefError('Сетевая ошибка при генерации брифа.');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const copyBrief = async () => {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // Sources helpers
  const handleAddSource = (seed: Omit<Source, 'id' | 'createdAt'>) => {
    const newSource: Source = { ...seed, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    persistSources([...sources, newSource]);
  };

  const handleDeleteSource = (id: string) => persistSources(sources.filter(s => s.id !== id));

  const handleToggleSource = (id: string) =>
    persistSources(sources.map(s => (s.id === id ? { ...s, active: !s.active } : s)));

  const handleScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanError(null);
    setScanStats(null);
    setLastScanNewCount(0);

    const existingUrls = candidates.map(c => c.url);
    const activeSources = sources.filter(s => s.active).slice(0, 10);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: activeSources, existingUrls }),
      });
      const data = await res.json();
      if (!res.ok) { setScanError(data.error ?? 'Ошибка сканирования'); return; }

      const now = new Date().toISOString();
      const scannedIds = new Set(activeSources.map(s => s.id));

      // Update lastScannedAt for scanned sources
      persistSources(sources.map(s => scannedIds.has(s.id) ? { ...s, lastScannedAt: now } : s));

      // Merge new candidates (deduplicate by URL)
      const existingUrlSet = new Set(candidates.map(c => c.url));
      const rawCandidates = data.candidates as Array<{
        sourceId: string; sourceName: string; url: string; title: string; reason: string; relevanceScore: number;
      }>;

      const fresh: Candidate[] = rawCandidates
        .filter(rc => !existingUrlSet.has(rc.url))
        .map(rc => ({
          id: crypto.randomUUID(),
          sourceId: rc.sourceId,
          sourceName: rc.sourceName,
          url: rc.url,
          title: rc.title,
          reason: rc.reason,
          relevanceScore: rc.relevanceScore,
          detectedAt: now,
          status: 'new' as const,
        }));

      setLastScanNewCount(fresh.length);
      persistCandidates([...fresh, ...candidates]);
      setScanStats(data.stats as ScanStats);

      if (fresh.length > 0) setTab('candidates');
    } catch {
      setScanError('Сетевая ошибка при сканировании.');
    } finally {
      setScanning(false);
    }
  };

  // Candidates helpers
  const handleAnalyzeCandidate = async (candidate: Candidate) => {
    if (analyzingId) return;
    setAnalyzingId(candidate.id);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidate.url }),
      });
      const data = await res.json();
      if (res.ok) {
        persistEvents([data as TriggerEvent, ...events]);
        persistCandidates(candidates.map(c => c.id === candidate.id ? { ...c, status: 'analyzed' } : c));
        setTab('events');
      }
    } catch { /* ignore */ } finally {
      setAnalyzingId(null);
    }
  };

  const handleIgnoreCandidate = (id: string) =>
    persistCandidates(candidates.map(c => c.id === id ? { ...c, status: 'ignored' } : c));

  // Derived
  const activeEvents   = events.filter(isActive);
  const archivedEvents = events.filter(e => !isActive(e));

  const criticalHighCount = activeEvents.filter(
    e => e.avangardImpact?.level === 'critical' || e.avangardImpact?.level === 'high'
  ).length;

  // markedCount only counts active marked events (archived can't go to brief)
  const markedCount = activeEvents.filter(e => e.markedForBrief).length;
  const newCandidateCount = candidates.filter(c => c.status === 'new').length;

  // Base pool for the current status filter
  const statusPool =
    statusFilter === 'active'   ? activeEvents :
    statusFilter === 'archived' ? archivedEvents :
    events;

  const filteredEvents = statusPool.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'marked') return e.markedForBrief;
    return e.category === filter;
  });

  const filterCount = (f: FilterType): number => {
    if (f === 'all') return statusPool.length;
    if (f === 'marked') return statusPool.filter(e => e.markedForBrief).length;
    return statusPool.filter(e => e.category === f).length;
  };

  if (!hydrated) return <div className="min-h-screen bg-gray-50" />;

  // Header stats
  const activeCompetitorCount = [...new Set(
    activeEvents.filter(e => e.category === 'competitor' && e.competitorName).map(e => e.competitorName!)
  )].length;
  const activeTrendCount = (() => {
    // Quick count: how many of the 12 trend definitions have ≥1 matching active event
    const TREND_PATTERNS = [
      /антистат/i, /мембран/i, /огнестойк|огнезащ/i, /спецобув/i,
      /\bсиз\b/i, /нефтегаз/i, /металлург/i, /строительств/i,
      /энергетик/i, /импортозамещ|локализ/i, /сертифик|гост|\bтр\s*тс\b/i, /тендер|закупк/i,
    ];
    return TREND_PATTERNS.filter(p =>
      activeEvents.some(e => p.test([e.title, e.summary, e.whatHappened ?? ''].join(' ')))
    ).length;
  })();

  const TABS: { value: Tab; label: string; count?: number; alert?: boolean }[] = [
    { value: 'events',    label: 'Сигналы',    count: events.length },
    { value: 'sources',   label: 'Источники',  count: sources.length },
    { value: 'candidates',label: 'Кандидаты',  count: newCandidateCount || undefined },
    { value: 'analytics', label: 'Аналитика',  count: criticalHighCount || undefined, alert: criticalHighCount > 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="leading-tight">
                <p className="font-semibold text-gray-900 text-sm leading-none">Авангард Аналитика</p>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5 hidden sm:block">Система рыночной и конкурентной аналитики</p>
              </div>
            </div>

            {/* Stats pills — compact summary */}
            {activeEvents.length > 0 && (
              <div className="hidden md:flex items-center gap-2">
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  Сигналов: <strong>{activeEvents.length}</strong>
                </span>
                {activeCompetitorCount > 0 && (
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                    Конкурентов: <strong>{activeCompetitorCount}</strong>
                  </span>
                )}
                {activeTrendCount > 0 && (
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                    Трендов: <strong>{activeTrendCount}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Tab nav */}
            <nav className="flex items-center gap-0.5 flex-shrink-0">
              {TABS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    tab === t.value ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tab === t.value
                        ? t.alert ? 'bg-red-200 text-red-700' : 'bg-blue-200 text-blue-700'
                        : t.alert ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">

        {/* ── Events Tab ── */}
        {tab === 'events' && (
          <>
            {/* Archive notification banner */}
            {justArchivedCount > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8m-9 4v4m4-4v4" />
                  </svg>
                  <span>Автоархивировано <strong>{justArchivedCount}</strong> устаревших {justArchivedCount === 1 ? 'событие' : justArchivedCount < 5 ? 'события' : 'событий'}</span>
                </div>
                <button
                  onClick={() => { setJustArchivedCount(0); setStatusFilter('archived'); }}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 flex-shrink-0"
                >
                  Показать архив
                </button>
              </div>
            )}

            {/* URL Input */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mb-6">
              <div className="flex gap-2 sm:gap-3">
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAnalyze(); }}
                  placeholder="Например: technoavia.ru, consultant.ru, zakupki.gov.ru или ссылка на новый ГОСТ..."
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-colors min-w-0"
                  disabled={loading}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={loading || !url.trim()}
                  className="px-4 sm:px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="hidden sm:block">Анализ...</span>
                    </>
                  ) : (
                    <span>Анализировать</span>
                  )}
                </button>
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 min-w-0">
                {/* Status filter + counters */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(
                      [
                        { value: 'active',   label: 'Активные', count: activeEvents.length },
                        { value: 'archived', label: 'Архив',    count: archivedEvents.length },
                        { value: 'all',      label: 'Все',      count: events.length },
                      ] as { value: StatusFilter; label: string; count: number }[]
                    ).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          statusFilter === opt.value
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {opt.label}
                        <span className={`text-[10px] font-bold ${statusFilter === opt.value ? 'text-gray-600' : 'text-gray-400'}`}>
                          {opt.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {FILTER_OPTIONS.map(({ value, label }) => {
                    const count = filterCount(value);
                    if (count === 0 && value !== 'all') return null;
                    return (
                      <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                          filter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${filter === value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 sm:p-10">
                    {events.length === 0 ? (
                      <div className="max-w-xs mx-auto text-center">
                        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-1.5">Рынок меняется каждый день</p>
                        <p className="text-xs text-gray-500 leading-relaxed mb-5">
                          Новые ГОСТы, тендеры на миллионы, шаги конкурентов — система автоматически анализирует источники и переводит их в конкретные выводы и рекомендации для Авангарда.
                        </p>
                        <div className="text-left space-y-3">
                          {([
                            ['1', 'Вставьте URL выше — получите анализ за 10 секунд'],
                            ['2', 'Или перейдите в «Источники» → запустите автосканирование'],
                            ['3', 'Отметьте важные сигналы — получите готовый еженедельный бриф'],
                          ] as [string, string][]).map(([num, text]) => (
                            <div key={num} className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{num}</span>
                              <p className="text-xs text-gray-600 leading-snug">{text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center">Нет событий в этой категории</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredEvents.map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onToggleMark={() => toggleMark(event.id)}
                        onDelete={() => deleteEvent(event.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Brief Panel */}
              <div className="lg:col-span-1">
                <div className={`bg-white rounded-xl border p-5 lg:sticky lg:top-20 transition-colors ${brief ? 'border-emerald-200' : 'border-gray-200'}`}>
                  <h2 className="font-semibold text-gray-900 mb-1">Аналитический бриф</h2>
                  <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                    Отмечайте события флажком. Когда накопится 3–5 — создайте готовый бриф для команды одним нажатием.
                  </p>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-4">
                    <span className="text-sm text-gray-600">Выбрано для брифа</span>
                    <span className={`text-xl font-bold ${markedCount > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{markedCount}</span>
                  </div>
                  <button
                    onClick={handleGenerateBrief}
                    disabled={markedCount === 0 || generatingBrief}
                    className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {generatingBrief ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Генерация...
                      </>
                    ) : 'Создать бриф'}
                  </button>
                  {briefError && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{briefError}</p>}
                  {brief && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-xs font-semibold text-gray-800">Бриф готов</span>
                        </div>
                        <button
                          onClick={copyBrief}
                          className={`text-xs font-medium flex items-center gap-1 transition-colors px-2.5 py-1 rounded-md ${copied ? 'text-emerald-700 bg-emerald-50' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'}`}
                        >
                          {copied ? (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Скопировано
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Скопировать текст
                            </>
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 max-h-[480px] overflow-y-auto">
                        {brief}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Sources Tab ── */}
        {tab === 'sources' && (
          <SourcesPanel
            sources={sources}
            newCandidateCount={lastScanNewCount}
            scanning={scanning}
            scanStats={scanStats}
            scanError={scanError}
            onAdd={handleAddSource}
            onDelete={handleDeleteSource}
            onToggle={handleToggleSource}
            onScan={handleScan}
          />
        )}

        {/* ── Candidates Tab ── */}
        {tab === 'candidates' && (
          <CandidateInbox
            candidates={candidates}
            analyzingId={analyzingId}
            onAnalyze={handleAnalyzeCandidate}
            onIgnore={handleIgnoreCandidate}
          />
        )}

        {/* ── Analytics Tab ── */}
        {tab === 'analytics' && (
          <AnalyticsPanel events={activeEvents} />
        )}
      </main>
    </div>
  );
}
