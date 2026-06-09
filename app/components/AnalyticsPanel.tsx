'use client';

import { useState } from 'react';
import type { TriggerEvent, EventImportance, AvangardDirection, ImpactLevel } from '@/lib/types';
import CompetitorWatch from './CompetitorWatch';

// ── Constants ─────────────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<EventImportance, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const IL_ORDER: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1, none: 0 };

const IMPORTANCE_LABEL: Record<EventImportance, string> = {
  critical: 'Критично', high: 'Важно', medium: 'Средне', low: 'Фон',
};
const IMPORTANCE_BADGE: Record<EventImportance, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-50 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
};

const DIR_LABEL: Record<AvangardDirection, string> = {
  workwear:        'Спецодежда',
  footwear:        'Спецобувь',
  ppe:             'СИЗ',
  'hi-vis':        'Сигнальная одежда',
  'flame-resistant': 'Огнестойкость',
  antistatic:      'Антистатика',
  membranes:       'Мембранные ткани',
  'oil-gas':       'Нефтегаз',
  metallurgy:      'Металлургия',
  construction:    'Строительство',
  chemicals:       'Химия',
  energy:          'Энергетика',
};

const IL_LABEL: Record<ImpactLevel, string> = { high: 'High', medium: 'Med', low: 'Low', none: '—' };
const IL_BADGE: Record<ImpactLevel, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-gray-100 text-gray-500',
  none:   'bg-white text-gray-300',
};

const BIZ_DIMS: Array<{ key: keyof NonNullable<TriggerEvent['businessImpact']>; label: string }> = [
  { key: 'sales',       label: 'Продажи' },
  { key: 'procurement', label: 'Закупки' },
  { key: 'production',  label: 'Производство' },
  { key: 'marketing',   label: 'Маркетинг' },
  { key: 'product',     label: 'Продукт' },
];

const TREND_TOPICS = [
  { key: 'membranes',     label: 'Мембранные ткани',  patterns: ['мембран'] },
  { key: 'antistatic',    label: 'Антистатика',       patterns: ['антистат'] },
  { key: 'flame',         label: 'Огнестойкость',     patterns: ['огнестойк', 'огнезащ'] },
  { key: 'footwear',      label: 'Спецобувь',         patterns: ['спецобув'] },
  { key: 'tenders',       label: 'Тендеры',           patterns: ['тендер', 'закупк'] },
  { key: 'localization',  label: 'Локализация',       patterns: ['локализ', 'реестр минпром'] },
  { key: 'production',    label: 'Производство',      patterns: ['производств'] },
  { key: 'workwear',      label: 'Спецодежда',        patterns: ['спецодежда'] },
  { key: 'ppe',           label: 'СИЗ',               patterns: ['\bсиз\b', 'средства защиты'] },
];

const NAV_ITEMS = [
  { id: 'summary',     label: 'Executive Summary' },
  { id: 'competitor',  label: 'Конкуренты' },
  { id: 'tender',      label: 'Тендеры' },
  { id: 'regulation',  label: 'Регуляторика' },
  { id: 'materials',   label: 'Материалы' },
  { id: 'bizimpact',   label: 'Business Impact' },
  { id: 'trends',      label: 'Тренды' },
];

// ── Aggregation helpers ───────────────────────────────────────────────────────

function sortByImpact(events: TriggerEvent[]): TriggerEvent[] {
  return [...events].sort((a, b) =>
    (IMPACT_ORDER[b.avangardImpact?.level ?? 'low'] ?? 1) -
    (IMPACT_ORDER[a.avangardImpact?.level ?? 'low'] ?? 1)
  );
}

function getTopItems(events: TriggerEvent[], key: 'threats' | 'opportunities', n = 5) {
  const out: Array<{ text: string; eventTitle: string; impact: EventImportance }> = [];
  for (const e of sortByImpact(events)) {
    for (const text of e[key] ?? []) {
      if (out.length >= n) break;
      out.push({ text, eventTitle: e.title, impact: e.avangardImpact?.level ?? 'low' });
    }
    if (out.length >= n) break;
  }
  return out;
}

function getTopActions(events: TriggerEvent[], n = 5) {
  return sortByImpact(events)
    .filter(e => e.suggestedAction && (e.importance === 'critical' || e.importance === 'high'))
    .slice(0, n)
    .map(e => ({ action: e.suggestedAction!, title: e.title, importance: e.importance ?? 'medium' }));
}


function getBizImpactMatrix(events: TriggerEvent[]) {
  const result: Record<string, Record<ImpactLevel, number>> = {};
  for (const d of BIZ_DIMS) result[d.key] = { high: 0, medium: 0, low: 0, none: 0 };
  for (const e of events) {
    if (!e.businessImpact) continue;
    for (const d of BIZ_DIMS) {
      const v = e.businessImpact[d.key] ?? 'none';
      result[d.key][v]++;
    }
  }
  return result;
}

function getTrends(events: TriggerEvent[]) {
  return TREND_TOPICS.map(topic => {
    const count = events.filter(e => {
      const haystack = [e.title, e.summary, e.whatHappened ?? '', e.whyItMattersForAvangard ?? '']
        .join(' ')
        .toLowerCase();
      return topic.patterns.some(p => new RegExp(p, 'i').test(haystack));
    }).length;
    return { ...topic, count };
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);
}

function getMaterialsEvents(events: TriggerEvent[]) {
  const MATERIAL_PATTERNS = /мембран|антистат|огнестойк|огнезащ|арамид|ткань|нити|волокн/i;
  return events.filter(e => {
    const text = [e.title, e.summary, e.whatHappened ?? ''].join(' ');
    return MATERIAL_PATTERNS.test(text) ||
      (e.businessImpact?.production && IL_ORDER[e.businessImpact.production] >= 2) ||
      (e.businessImpact?.product    && IL_ORDER[e.businessImpact.product]    >= 2);
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{count}</span>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-gray-400 py-4 text-center">{label}</p>;
}

function ImpactBadge({ level }: { level: EventImportance }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${IMPORTANCE_BADGE[level]}`}>
      {IMPORTANCE_LABEL[level]}
    </span>
  );
}

// ── Section: Executive Summary ────────────────────────────────────────────────

function SectionSummary({ events }: { events: TriggerEvent[] }) {
  const threats = getTopThreatsOrOpps(events, 'threats');
  const opps    = getTopThreatsOrOpps(events, 'opportunities');
  const actions = getTopActions(events);
  return (
    <div className="space-y-6">
      <SectionHeader title="Executive Summary" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Threats */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">Топ-5 Угроз</p>
          {threats.length === 0
            ? <EmptyState label="Угроз не выявлено" />
            : <ol className="space-y-2">
                {threats.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-xs font-bold text-red-300 flex-shrink-0 w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-red-800 leading-snug">{t.text}</p>
                      <p className="text-[10px] text-red-400 truncate mt-0.5">{t.eventTitle}</p>
                    </div>
                    <ImpactBadge level={t.impact} />
                  </li>
                ))}
              </ol>
          }
        </div>
        {/* Opportunities */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-3">Топ-5 Возможностей</p>
          {opps.length === 0
            ? <EmptyState label="Возможностей не выявлено" />
            : <ol className="space-y-2">
                {opps.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-xs font-bold text-emerald-300 flex-shrink-0 w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-emerald-800 leading-snug">{o.text}</p>
                      <p className="text-[10px] text-emerald-400 truncate mt-0.5">{o.eventTitle}</p>
                    </div>
                    <ImpactBadge level={o.impact} />
                  </li>
                ))}
              </ol>
          }
        </div>
        {/* Actions */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-3">Топ-5 Действий</p>
          {actions.length === 0
            ? <EmptyState label="Нет приоритетных действий" />
            : <ol className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-xs font-bold text-blue-300 flex-shrink-0 w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-800 leading-snug">{a.action}</p>
                      <p className="text-[10px] text-blue-400 truncate mt-0.5">{a.title}</p>
                    </div>
                    <ImpactBadge level={a.importance} />
                  </li>
                ))}
              </ol>
          }
        </div>
      </div>
    </div>
  );
}

// helper used in both columns
function getTopThreatsOrOpps(events: TriggerEvent[], key: 'threats' | 'opportunities') {
  return getTopItems(events, key, 5);
}

// ── Section: Tender Intelligence ──────────────────────────────────────────────

function SectionTender({ events }: { events: TriggerEvent[] }) {
  const tenders = events.filter(e => e.category === 'tender');
  const critical = tenders.filter(e => e.avangardImpact?.level === 'critical').length;
  const high     = tenders.filter(e => e.avangardImpact?.level === 'high').length;
  const priority = sortByImpact(tenders).filter(
    e => e.avangardImpact?.level === 'critical' || e.avangardImpact?.level === 'high'
  );
  return (
    <div>
      <SectionHeader title="Tender Intelligence" count={tenders.length} />
      {tenders.length === 0
        ? <EmptyState label="Нет тендерных событий" />
        : <>
            <div className="flex gap-3 mb-4">
              {[
                { label: 'Всего', val: tenders.length, cls: 'bg-gray-50 text-gray-700 border-gray-200' },
                { label: 'Critical', val: critical,     cls: 'bg-red-50 text-red-700 border-red-100' },
                { label: 'High',     val: high,         cls: 'bg-orange-50 text-orange-700 border-orange-100' },
              ].map(({ label, val, cls }) => (
                <div key={label} className={`border rounded-lg px-3 py-2 text-center min-w-[72px] ${cls}`}>
                  <p className="text-xl font-bold">{val}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
            {priority.length > 0 && (
              <div className="space-y-2">
                {priority.map(e => (
                  <div key={e.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                    <ImpactBadge level={e.avangardImpact!.level} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 leading-snug">{e.title}</p>
                      {e.suggestedAction && (
                        <p className="text-[10px] text-blue-600 mt-0.5 leading-snug">{e.suggestedAction}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
      }
    </div>
  );
}

// ── Section: Regulatory Intelligence ─────────────────────────────────────────

function SectionRegulation({ events }: { events: TriggerEvent[] }) {
  const regs = sortByImpact(events.filter(e => e.category === 'regulation'));
  const priority = regs.filter(
    e => e.avangardImpact?.level === 'critical' || e.avangardImpact?.level === 'high'
  );
  // group by sourceDomain
  const byDomain = new Map<string, TriggerEvent[]>();
  for (const e of regs) {
    const domain = (() => { try { return new URL(e.url).hostname.replace('www.', ''); } catch { return 'unknown'; } })();
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(e);
  }
  return (
    <div>
      <SectionHeader title="Regulatory Intelligence" count={regs.length} />
      {regs.length === 0
        ? <EmptyState label="Нет регуляторных событий" />
        : <>
            {priority.length > 0 && (
              <div className="space-y-2 mb-4">
                {priority.map(e => (
                  <div key={e.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                    <ImpactBadge level={e.avangardImpact!.level} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 leading-snug">{e.title}</p>
                      {e.whyItMattersForAvangard && (
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{e.whyItMattersForAvangard}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {byDomain.size > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">По источникам</p>
                <div className="flex flex-wrap gap-2">
                  {[...byDomain.entries()].map(([domain, evs]) => (
                    <span key={domain} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-lg px-2.5 py-1">
                      {domain} <span className="font-bold">{evs.length}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
      }
    </div>
  );
}

// ── Section: Materials & Technology ──────────────────────────────────────────

function SectionMaterials({ events }: { events: TriggerEvent[] }) {
  const mats = sortByImpact(getMaterialsEvents(events));
  return (
    <div>
      <SectionHeader title="Материалы и технологии" count={mats.length} />
      {mats.length === 0
        ? <EmptyState label="Нет событий по материалам" />
        : <div className="space-y-2">
            {mats.map(e => (
              <div key={e.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                {e.avangardImpact && <ImpactBadge level={e.avangardImpact.level} />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 leading-snug">{e.title}</p>
                  {e.summary && <p className="text-[10px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{e.summary}</p>}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── Section: Business Impact Matrix ──────────────────────────────────────────

function SectionBizImpact({ events }: { events: TriggerEvent[] }) {
  const matrix = getBizImpactMatrix(events);
  const withData = events.filter(e => e.businessImpact).length;
  const LEVELS: ImpactLevel[] = ['high', 'medium', 'low'];
  return (
    <div>
      <SectionHeader title="Business Impact Matrix" />
      {withData === 0
        ? <EmptyState label="Нет событий с оценкой businessImpact — проанализируйте новые URL" />
        : <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Функция</th>
                  {LEVELS.map(l => (
                    <th key={l} className="text-center px-3 py-2 font-semibold text-gray-600 capitalize">{IL_LABEL[l]}</th>
                  ))}
                  <th className="text-center px-3 py-2 font-semibold text-gray-600">Итого</th>
                </tr>
              </thead>
              <tbody>
                {BIZ_DIMS.map(({ key, label }, i) => {
                  const row = matrix[key];
                  const total = LEVELS.reduce((s, l) => s + (row[l] ?? 0), 0);
                  return (
                    <tr key={key} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                      {LEVELS.map(l => (
                        <td key={l} className="text-center px-3 py-2.5">
                          {row[l] > 0
                            ? <span className={`inline-block min-w-[28px] text-center font-bold px-1.5 py-0.5 rounded ${IL_BADGE[l]}`}>{row[l]}</span>
                            : <span className="text-gray-200">—</span>
                          }
                        </td>
                      ))}
                      <td className="text-center px-3 py-2.5 font-semibold text-gray-700">
                        {total > 0 ? total : <span className="text-gray-200">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      }
    </div>
  );
}

// ── Section: Trend Detection ──────────────────────────────────────────────────

function SectionTrends({ events }: { events: TriggerEvent[] }) {
  const trends = getTrends(events);
  const max = trends[0]?.count ?? 1;
  return (
    <div>
      <SectionHeader title="Trend Detection" />
      {trends.length === 0
        ? <EmptyState label="Недостаточно событий для выявления трендов" />
        : <div className="space-y-2.5">
            {trends.map(t => (
              <div key={t.key} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-700 w-40 flex-shrink-0">{t.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.max(8, (t.count / max) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-500 w-10 text-right flex-shrink-0">
                  {t.count} {t.count === 1 ? 'событие' : t.count < 5 ? 'события' : 'событий'}
                </span>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  events: TriggerEvent[];
}

export default function AnalyticsPanel({ events }: AnalyticsPanelProps) {
  const [activeSection, setActiveSection] = useState('summary');

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Нет данных для аналитики</p>
        <p className="text-xs text-gray-400">Проанализируйте хотя бы несколько URL на вкладке «События»</p>
      </div>
    );
  }

  const criticalHighCount = events.filter(
    e => e.avangardImpact?.level === 'critical' || e.avangardImpact?.level === 'high'
  ).length;

  return (
    <div className="flex gap-6">
      {/* Left nav */}
      <nav className="w-44 flex-shrink-0">
        <div className="bg-white border border-gray-200 rounded-xl p-2 sticky top-20 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeSection === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="pt-2 mt-1 border-t border-gray-100 px-3">
            <p className="text-[10px] text-gray-400">{events.length} событий</p>
            {criticalHighCount > 0 && (
              <p className="text-[10px] text-red-500 font-semibold">{criticalHighCount} приоритетных</p>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {activeSection === 'summary'    && <SectionSummary    events={events} />}
        {activeSection === 'competitor' && <CompetitorWatch events={events} />}
        {activeSection === 'tender'     && <SectionTender     events={events} />}
        {activeSection === 'regulation' && <SectionRegulation events={events} />}
        {activeSection === 'materials'  && <SectionMaterials  events={events} />}
        {activeSection === 'bizimpact'  && <SectionBizImpact  events={events} />}
        {activeSection === 'trends'     && <SectionTrends     events={events} />}
      </div>
    </div>
  );
}
