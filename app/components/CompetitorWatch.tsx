'use client';

import { useState } from 'react';
import type { TriggerEvent, EventImportance, AvangardDirection } from '@/lib/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<EventImportance, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const IMPORTANCE_LABEL: Record<EventImportance, string> = {
  critical: 'Критично', high: 'Важно', medium: 'Средне', low: 'Фон',
};

const IMPORTANCE_BADGE: Record<EventImportance, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high:     'bg-orange-100 text-orange-700 border border-orange-100',
  medium:   'bg-yellow-50 text-yellow-700 border border-yellow-100',
  low:      'bg-gray-100 text-gray-500 border border-gray-200',
};

const DIR_LABEL: Record<AvangardDirection, string> = {
  workwear:          'Спецодежда',
  footwear:          'Спецобувь',
  ppe:               'СИЗ',
  'hi-vis':          'Сигнальная одежда',
  'flame-resistant': 'Огнестойкость',
  antistatic:        'Антистатика',
  membranes:         'Мембраны',
  'oil-gas':         'Нефтегаз',
  metallurgy:        'Металлургия',
  construction:      'Строительство',
  chemicals:         'Химия',
  energy:            'Энергетика',
};

// Study topics — patterns mapped to readable labels
const STUDY_TOPICS: Array<{ key: string; label: string; patterns: RegExp }> = [
  { key: 'assortment',     label: '📦 Ассортимент',    patterns: /ассортимент|каталог|новинк|линейк|коллекц|продукт|модел/i },
  { key: 'materials',      label: '🧵 Материалы',       patterns: /ткань|мембран|антистат|огнестойк|арамид|волокн|материал|сырь|состав/i },
  { key: 'promotions',     label: '🏷️ Акции',           patterns: /акци|скидк|распродаж|промо|специальн.*цен|предложени/i },
  { key: 'service',        label: '🛠 Сервис',           patterns: /сервис|поддержк|гарантия|обслуж|ремонт|замен/i },
  { key: 'delivery',       label: '🚚 Доставка',        patterns: /доставк|логистик|отгрузк|склад|срок.*доставк/i },
  { key: 'preorder',       label: '📋 Предзаказы',      patterns: /предзаказ|предварительн.*заказ|резерв|бронирован/i },
  { key: 'customization',  label: '✏️ Кастомизация',    patterns: /кастомиз|индивидуальн|персонализ|брендирован|логотип|нанесени/i },
  { key: 'certification',  label: '📜 Сертификация',    patterns: /сертифик|гост|тр тс|соответстви|аттестац|допуск/i },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompetitorProfile {
  name: string;
  events: TriggerEvent[];
  maxThreatLevel: EventImportance;
  maxAvangardImpact: EventImportance;
  criticalHighCount: number;
  overlapDirs: AvangardDirection[];
  latestEventDate: string;
  rankScore: number;
}

interface StudyIdea {
  topicLabel: string;
  text: string;
  source: string; // 'action' | 'opportunity' | 'overlap'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveCompetitorName(event: TriggerEvent): string {
  if (event.competitorName && event.competitorName !== 'null') return event.competitorName;
  try {
    const host = new URL(event.url).hostname.replace('www.', '');
    // Map known domains to friendly names
    const DOMAIN_MAP: Record<string, string> = {
      'technoavia.ru':       'Техноавиа',
      'vostok-service.ru':   'Восток-Сервис',
      'ursus.ru':            'Урсус',
      'soyuzspecodezhda.ru': 'СОЮЗСПЕЦОДЕЖДА',
      'trakt.ru':            'Тракт',
      'fakel.ru':            'Факел',
    };
    return DOMAIN_MAP[host] ?? host;
  } catch {
    return 'Неизвестный конкурент';
  }
}

function resolveThreatLevel(event: TriggerEvent): EventImportance {
  if (event.competitorIntel?.threatLevel) return event.competitorIntel.threatLevel;
  if (event.avangardImpact?.level)        return event.avangardImpact.level;
  return event.importance ?? 'low';
}

function maxImportance(levels: EventImportance[]): EventImportance {
  return levels.reduce<EventImportance>(
    (best, cur) => IMPACT_ORDER[cur] > IMPACT_ORDER[best] ? cur : best,
    'low',
  );
}

function buildCompetitorProfiles(events: TriggerEvent[]): CompetitorProfile[] {
  const map = new Map<string, TriggerEvent[]>();

  for (const e of events) {
    if (e.category !== 'competitor') continue;
    const name = resolveCompetitorName(e);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(e);
  }

  const profiles: CompetitorProfile[] = [];

  for (const [name, evs] of map.entries()) {
    const threatLevels  = evs.map(resolveThreatLevel);
    const impactLevels  = evs.map(e => e.avangardImpact?.level ?? 'low');
    const maxThreat     = maxImportance(threatLevels);
    const maxImpact     = maxImportance(impactLevels);
    const critHighCount = evs.filter(e => {
      const t = resolveThreatLevel(e);
      return t === 'critical' || t === 'high';
    }).length;

    const overlapSet = new Set<AvangardDirection>();
    for (const e of evs) {
      for (const d of e.competitorIntel?.overlap ?? []) overlapSet.add(d);
    }

    const sorted = [...evs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestDate = sorted[0]?.date ?? new Date(0).toISOString();
    const freshnessDays = Math.floor((Date.now() - new Date(latestDate).getTime()) / 86_400_000);

    const rankScore =
      critHighCount * 10 +
      IMPACT_ORDER[maxThreat] * 4 +
      overlapSet.size * 2 +
      (freshnessDays < 30 ? 5 : freshnessDays < 90 ? 2 : 0);

    profiles.push({
      name,
      events:            sorted,
      maxThreatLevel:    maxThreat,
      maxAvangardImpact: maxImpact,
      criticalHighCount: critHighCount,
      overlapDirs:       [...overlapSet],
      latestEventDate:   latestDate,
      rankScore,
    });
  }

  return profiles.sort((a, b) => b.rankScore - a.rankScore);
}

function buildStudyIdeas(profile: CompetitorProfile): StudyIdea[] {
  const ideas: StudyIdea[] = [];
  const seen = new Set<string>(); // deduplicate by text

  const addIdea = (topicLabel: string, text: string, source: string) => {
    const key = topicLabel + '|' + text.slice(0, 60);
    if (seen.has(key)) return;
    seen.add(key);
    ideas.push({ topicLabel, text, source });
  };

  for (const event of profile.events) {
    // 1. suggestedAction / recommendedAction
    const actionText = (event as unknown as Record<string, unknown>).recommendedAction as string | undefined
      ?? event.suggestedAction;
    if (actionText) {
      for (const topic of STUDY_TOPICS) {
        if (topic.patterns.test(actionText)) {
          addIdea(topic.label, actionText, 'action');
          break; // one topic per action
        }
      }
      // If no topic matched, still include under a generic label if it's specific enough
      if (ideas.every(i => i.text !== actionText) && actionText.length > 20) {
        addIdea('🔍 Изучить', actionText, 'action');
      }
    }

    // 2. opportunities[]
    for (const opp of event.opportunities ?? []) {
      for (const topic of STUDY_TOPICS) {
        if (topic.patterns.test(opp)) {
          addIdea(topic.label, opp, 'opportunity');
          break;
        }
      }
    }

    // 3. competitorIntel.overlap → generic study suggestions per direction
    for (const dir of event.competitorIntel?.overlap ?? []) {
      const label = DIR_LABEL[dir];
      const idea  = `Изучить ассортимент и позиционирование конкурента в направлении «${label}»`;
      addIdea('📦 Ассортимент', idea, 'overlap');
    }
  }

  // Sort: action > opportunity > overlap, then by topic
  const ORDER: Record<string, number> = { action: 0, opportunity: 1, overlap: 2 };
  ideas.sort((a, b) => (ORDER[a.source] ?? 9) - (ORDER[b.source] ?? 9));

  return ideas;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThreatBadge({ level }: { level: EventImportance }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${IMPORTANCE_BADGE[level]}`}>
      {IMPORTANCE_LABEL[level]}
    </span>
  );
}

function OverlapTag({ dir }: { dir: AvangardDirection }) {
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
      {DIR_LABEL[dir]}
    </span>
  );
}

// ── Competitor Rank Card ──────────────────────────────────────────────────────

function RankCard({
  profile,
  rank,
  onSelect,
}: {
  profile: CompetitorProfile;
  rank: number;
  onSelect: () => void;
}) {
  const recent = profile.events.slice(0, 3);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        {/* Rank number */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          rank === 1 ? 'bg-red-100 text-red-600' :
          rank === 2 ? 'bg-orange-100 text-orange-600' :
          rank === 3 ? 'bg-yellow-100 text-yellow-600' :
                       'bg-gray-100 text-gray-400'
        }`}>
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + threat badge */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{profile.name}</span>
            <ThreatBadge level={profile.maxThreatLevel} />
            {profile.criticalHighCount > 0 && (
              <span className="text-[10px] font-bold text-red-500">
                ⚡ {profile.criticalHighCount} крит/важн
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
            <span>{profile.events.length} {profile.events.length === 1 ? 'событие' : profile.events.length < 5 ? 'события' : 'событий'}</span>
            {profile.overlapDirs.length > 0 && (
              <span>{profile.overlapDirs.length} напр. пересечения</span>
            )}
            <span>
              {(() => {
                const d = Math.floor((Date.now() - new Date(profile.latestEventDate).getTime()) / 86_400_000);
                return d === 0 ? 'сегодня' : `${d} дн. назад`;
              })()}
            </span>
          </div>

          {/* Overlap tags (first 4) */}
          {profile.overlapDirs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {profile.overlapDirs.slice(0, 4).map(d => <OverlapTag key={d} dir={d} />)}
              {profile.overlapDirs.length > 4 && (
                <span className="text-[10px] text-gray-400 self-center">+{profile.overlapDirs.length - 4}</span>
              )}
            </div>
          )}

          {/* Recent events preview */}
          <div className="space-y-1 mb-3">
            {recent.map(e => (
              <div key={e.id} className="flex items-start gap-1.5">
                <ThreatBadge level={resolveThreatLevel(e)} />
                <p className="text-[11px] text-gray-600 leading-snug line-clamp-1 flex-1">{e.title}</p>
              </div>
            ))}
          </div>

          <button
            onClick={onSelect}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Подробнее →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Competitor Detail ─────────────────────────────────────────────────────────

function CompetitorDetail({
  profile,
  onBack,
}: {
  profile: CompetitorProfile;
  onBack: () => void;
}) {
  const studyIdeas = buildStudyIdeas(profile);

  // Aggregate threats and opportunities
  const allThreats: Array<{ text: string; level: EventImportance }> = [];
  const allOpps:    Array<{ text: string; level: EventImportance }> = [];
  const allActions: Array<{ text: string; level: EventImportance }> = [];

  for (const e of profile.events) {
    const level = resolveThreatLevel(e);
    for (const t of e.threats       ?? []) allThreats.push({ text: t, level });
    for (const o of e.opportunities ?? []) allOpps.push({ text: o, level });
    if (e.suggestedAction) allActions.push({ text: e.suggestedAction, level });
  }

  // Sort descending by importance
  const byLevel = (a: { level: EventImportance }, b: { level: EventImportance }) =>
    IMPACT_ORDER[b.level] - IMPACT_ORDER[a.level];

  const topThreats  = allThreats.sort(byLevel).slice(0, 6);
  const topOpps     = allOpps.sort(byLevel).slice(0, 6);
  const topActions  = allActions.sort(byLevel).slice(0, 5);

  // Group study ideas by topic
  const studyByTopic = new Map<string, StudyIdea[]>();
  for (const idea of studyIdeas) {
    if (!studyByTopic.has(idea.topicLabel)) studyByTopic.set(idea.topicLabel, []);
    studyByTopic.get(idea.topicLabel)!.push(idea);
  }

  return (
    <div>
      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Все конкуренты
        </button>
        <span className="text-gray-200">|</span>
        <h3 className="text-base font-semibold text-gray-900">{profile.name}</h3>
        <ThreatBadge level={profile.maxThreatLevel} />
      </div>

      {/* Threat summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Всего событий',   val: profile.events.length,       cls: 'text-gray-700' },
          { label: 'Крит / Важных',   val: profile.criticalHighCount,   cls: profile.criticalHighCount > 0 ? 'text-red-600' : 'text-gray-400' },
          { label: 'Макс. угроза',    val: IMPORTANCE_LABEL[profile.maxThreatLevel], cls: 'text-orange-600' },
          { label: 'Направлений',     val: profile.overlapDirs.length,  cls: 'text-blue-600' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-center">
            <p className={`text-lg font-bold ${cls}`}>{val}</p>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Overlap directions */}
      {profile.overlapDirs.length > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">Overlap с Авангардом</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.overlapDirs.map(d => <OverlapTag key={d} dir={d} />)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Top Threats */}
        {topThreats.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">Угрозы</p>
            <ul className="space-y-2">
              {topThreats.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ThreatBadge level={t.level} />
                  <p className="text-xs text-red-800 leading-snug flex-1">{t.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Opportunities */}
        {topOpps.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-3">Возможности</p>
            <ul className="space-y-2">
              {topOpps.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ThreatBadge level={o.level} />
                  <p className="text-xs text-emerald-800 leading-snug flex-1">{o.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommended Actions */}
      {topActions.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-3">Рекомендованные действия</p>
          <ul className="space-y-2">
            {topActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-blue-800 leading-snug flex-1">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What to study — main new block */}
      {studyByTopic.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
            🔬 Что изучить у конкурента
          </p>
          <div className="space-y-3">
            {[...studyByTopic.entries()].map(([topic, ideas]) => (
              <div key={topic}>
                <p className="text-[11px] font-semibold text-gray-500 mb-1">{topic}</p>
                <ul className="space-y-1">
                  {ideas.map((idea, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
                      <p className="text-xs text-gray-700 leading-snug">{idea.text}</p>
                      <span className={`text-[9px] font-medium flex-shrink-0 px-1 py-0.5 rounded uppercase tracking-wide ${
                        idea.source === 'action'
                          ? 'bg-blue-50 text-blue-400'
                          : idea.source === 'opportunity'
                          ? 'bg-emerald-50 text-emerald-400'
                          : 'bg-orange-50 text-orange-300'
                      }`}>
                        {idea.source === 'action' ? 'действие' : idea.source === 'opportunity' ? 'возможность' : 'overlap'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal Timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
          Signal Timeline
        </p>
        <div className="space-y-2">
          {profile.events.map(e => {
            const level = resolveThreatLevel(e);
            const date  = new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            return (
              <div key={e.id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-[10px] text-gray-400 flex-shrink-0 w-14 pt-0.5">{date}</span>
                <ThreatBadge level={level} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">{e.title}</p>
                  {e.avangardImpact?.reason && (
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-snug line-clamp-1">{e.avangardImpact.reason}</p>
                  )}
                </div>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:text-blue-600 flex-shrink-0"
                  title={e.url}
                >
                  ↗
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CompetitorWatchProps {
  events: TriggerEvent[]; // already filtered to active only by parent
}

export default function CompetitorWatch({ events }: CompetitorWatchProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const profiles = buildCompetitorProfiles(events);

  // ── Empty state ──
  if (profiles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Нет конкурентных сигналов</p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
          Пока нет конкурентных сигналов. Добавьте или просканируйте источники конкурентов: Техноавиа, Восток-Сервис, Урсус, СОЮЗСПЕЦОДЕЖДА.
        </p>
      </div>
    );
  }

  // ── Detail view ──
  if (selected) {
    const profile = profiles.find(p => p.name === selected);
    if (profile) {
      return <CompetitorDetail profile={profile} onBack={() => setSelected(null)} />;
    }
  }

  // ── Ranking list ──
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Competitor Ranking</h3>
        <span className="text-xs text-gray-400">{profiles.length} {profiles.length === 1 ? 'конкурент' : profiles.length < 5 ? 'конкурента' : 'конкурентов'}</span>
      </div>
      <div className="space-y-3">
        {profiles.map((p, i) => (
          <RankCard
            key={p.name}
            profile={p}
            rank={i + 1}
            onSelect={() => setSelected(p.name)}
          />
        ))}
      </div>
    </div>
  );
}
