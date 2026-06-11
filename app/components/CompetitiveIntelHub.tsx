'use client';

import { useState } from 'react';
import type { TriggerEvent, EventImportance } from '@/lib/types';
import { buildCorrelationClusters } from './CorrelationEngine';
import {
  buildEnhancedProfiles,
  buildHubSummary,
  resolveThreatLevel,
  DIR_LABEL,
  CORE_DIRS,
  type EnhancedCompetitorProfile,
  type ThreatScoreLevel,
} from '@/lib/competitorIntelHelpers';

// ── Style maps ────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<ThreatScoreLevel, { bg: string; text: string; bar: string; label: string }> = {
  critical: { bg: 'bg-red-50',    text: 'text-red-700',    bar: 'bg-red-500',    label: 'Критическая угроза' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', label: 'Высокая угроза'     },
  moderate: { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-400', label: 'Умеренная угроза'   },
  low:      { bg: 'bg-gray-50',   text: 'text-gray-500',   bar: 'bg-gray-300',   label: 'Низкая угроза'      },
};

const IMP_BADGE: Record<EventImportance, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-50 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
};

const IMP_LABEL: Record<EventImportance, string> = {
  critical: 'Критично', high: 'Важно', medium: 'Средне', low: 'Фон',
};

const IMP_DOT: Record<EventImportance, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
};

const EVENT_CARD_BORDER: Record<EventImportance, string> = {
  critical: 'border-red-100 bg-red-50/30',
  high:     'border-orange-100 bg-orange-50/20',
  medium:   'border-gray-100 bg-gray-50',
  low:      'border-gray-100 bg-gray-50',
};

// ── Atoms ─────────────────────────────────────────────────────────────────────

function ThreatScoreBar({ score, level }: { score: number; level: ThreatScoreLevel }) {
  const s = LEVEL_STYLES[level];
  return (
    <div className="flex items-center gap-3">
      <span className={`text-3xl font-black tabular-nums leading-none ${s.text}`}>{score}</span>
      <div className="flex-1">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-[11px] font-semibold mt-0.5 block ${s.text}`}>{s.label}</span>
      </div>
    </div>
  );
}

function ThreatLevelBadge({ level }: { level: EventImportance }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${IMP_BADGE[level]}`}>
      {IMP_LABEL[level]}
    </span>
  );
}

function WhyNowBlock({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5">Почему сейчас</p>
      {text.split('\n').map((line, i) => (
        <p key={i} className="text-xs text-blue-900 leading-relaxed">{line}</p>
      ))}
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatDaysAgo(dateStr: string): string {
  const days = Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
  if (days === 1) return '1 день назад';
  if (days < 5)  return `${days} дня назад`;
  return `${days} дней назад`;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 20); }
}

// ── HubHeader ─────────────────────────────────────────────────────────────────

function HubHeader({ profiles }: { profiles: EnhancedCompetitorProfile[] }) {
  const summary = buildHubSummary(profiles);
  const top     = profiles[0];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-5">
      <div className="text-center min-w-[48px]">
        <p className="text-2xl font-black text-gray-900 leading-none">{summary.competitorCount}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">конкурентов</p>
      </div>
      <div className="w-px h-8 bg-gray-100 hidden sm:block" />
      <div className="text-center min-w-[48px]">
        <p className="text-2xl font-black text-gray-900 leading-none">{summary.newSignalsLast30d}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">сигналов за 30 дн.</p>
      </div>
      {top && (
        <>
          <div className="w-px h-8 bg-gray-100 hidden sm:block" />
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">Наибольшая угроза</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-700">{top.name}</span>
              <span className="text-sm font-black text-red-600">{top.threatScore}</span>
            </div>
          </div>
        </>
      )}
      {summary.sharedAttackDirs.length > 0 && (
        <>
          <div className="w-px h-8 bg-gray-100 hidden sm:block" />
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Совместная атака</p>
            <div className="flex flex-wrap gap-1">
              {summary.sharedAttackDirs.slice(0, 3).map(d => (
                <span key={d} className="text-[10px] bg-red-50 text-red-600 font-medium px-1.5 py-0.5 rounded">
                  {DIR_LABEL[d]}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── CompetitorCard ────────────────────────────────────────────────────────────

function CompetitorCard({
  profile,
  rank,
  onSelect,
}: {
  profile:  EnhancedCompetitorProfile;
  rank:     number;
  onSelect: () => void;
}) {
  const s = LEVEL_STYLES[profile.threatScoreLevel];
  const allEvents = [...profile.activeEvents, ...profile.archivedEvents]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className={`bg-white rounded-xl p-4 border ${profile.threatScoreLevel === 'critical' ? 'border-red-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${s.bg} ${s.text}`}>
            {rank}
          </span>
          <h3 className="text-sm font-bold text-gray-900 truncate">{profile.name}</h3>
          {profile.threatScoreLevel === 'critical' && (
            <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
              Опасно
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatDaysAgo(profile.latestEventDate)}</span>
      </div>

      {/* Score */}
      <ThreatScoreBar score={profile.threatScore} level={profile.threatScoreLevel} />

      {/* Stats */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] text-gray-400">
          {allEvents.length} {allEvents.length === 1 ? 'сигнал' : 'сигнала'} всего
        </span>
        {profile.newSignals30d > 0 && (
          <span className="text-[10px] text-orange-600 font-medium">
            +{profile.newSignals30d} за 30 дн.
          </span>
        )}
        {profile.relevantClusterCount > 0 && (
          <span className="text-[10px] text-purple-600">
            {profile.relevantClusterCount} корр.
          </span>
        )}
      </div>

      {/* Why Now */}
      <WhyNowBlock text={profile.whyNow} />

      {/* Recent signals */}
      {allEvents.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Последние сигналы
          </p>
          <ul className="space-y-1.5">
            {allEvents.slice(0, 3).map(e => (
              <li key={e.id} className="flex items-start gap-1.5">
                <ThreatLevelBadge level={resolveThreatLevel(e)} />
                <span className="text-[11px] text-gray-700 leading-snug line-clamp-2">
                  {e.title.length > 75 ? e.title.slice(0, 75) + '…' : e.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onSelect}
        className="mt-3 w-full py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
      >
        Подробнее →
      </button>
    </div>
  );
}

// ── EventCard (used in detail view) ──────────────────────────────────────────

function EventCard({ event }: { event: TriggerEvent }) {
  const level = resolveThreatLevel(event);
  return (
    <div className={`rounded-lg border p-3 ${EVENT_CARD_BORDER[level]}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <ThreatLevelBadge level={level} />
          {event.status === 'archived' && (
            <span className="text-[10px] text-gray-400 italic">архив</span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDaysAgo(event.date)}</span>
      </div>
      <p className="text-xs font-semibold text-gray-900 leading-snug mt-1">{event.title}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{extractDomain(event.url)}</p>
      {event.avangardImpact?.reason && (
        <p className="text-[11px] text-gray-700 mt-1.5 leading-snug">{event.avangardImpact.reason}</p>
      )}
      {(event.threats ?? []).length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {event.threats!.map((t, i) => (
            <li key={i} className="text-[10px] text-red-700 leading-snug before:content-['▸_']">{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── CompetitorDetailView ──────────────────────────────────────────────────────

function CompetitorDetailView({
  profile,
  rank,
  onBack,
}: {
  profile: EnhancedCompetitorProfile;
  rank:    number;
  onBack:  () => void;
}) {
  const allEvents = [...profile.activeEvents, ...profile.archivedEvents]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          ← Назад к списку
        </button>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${LEVEL_STYLES[profile.threatScoreLevel].bg} ${LEVEL_STYLES[profile.threatScoreLevel].text}`}>
              {rank}
            </span>
            <h2 className="text-base font-black text-gray-900">{profile.name}</h2>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            {formatDaysAgo(profile.latestEventDate)}
          </span>
        </div>
        <ThreatScoreBar score={profile.threatScore} level={profile.threatScoreLevel} />
      </div>

      {/* Why Now */}
      {profile.whyNow && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Почему сейчас</p>
          {profile.whyNow.split('\n').map((line, i) => (
            <p key={i} className="text-sm text-gray-800 leading-relaxed">{line}</p>
          ))}
        </div>
      )}

      {/* Direction overlap */}
      {(profile.coreOverlapDirs.length > 0 || profile.overlapDirs.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Пересечения с Авангардом
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.coreOverlapDirs.map(d => (
              <span key={d} className="text-xs bg-red-50 text-red-700 font-medium px-2.5 py-1 rounded-full border border-red-100">
                {DIR_LABEL[d]}
              </span>
            ))}
            {profile.overlapDirs.filter(d => !CORE_DIRS.has(d)).map(d => (
              <span key={d} className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
                {DIR_LABEL[d]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* All events */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Все сигналы ({allEvents.length})
        </p>
        <div className="space-y-2">
          {allEvents.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      </div>

      {/* Threats */}
      {profile.allThreats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Угрозы для Авангарда
          </p>
          <ul className="space-y-1.5">
            {profile.allThreats.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${IMP_DOT[t.level]}`} />
                <span className="text-xs text-gray-700 leading-snug">{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {profile.allOpportunities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Возможности
          </p>
          <ul className="space-y-1.5">
            {profile.allOpportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-emerald-400" />
                <span className="text-xs text-gray-700 leading-snug">{o.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {profile.allActions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Что делать
          </p>
          <ul className="space-y-1.5">
            {profile.allActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-xs text-blue-500 font-bold flex-shrink-0 mt-px">→</span>
                <span className="text-xs text-gray-700 leading-snug">{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CompetitiveIntelHub({
  activeEvents,
  allEvents,
}: {
  activeEvents: TriggerEvent[];
  allEvents:    TriggerEvent[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const clusters = buildCorrelationClusters(activeEvents);
  const profiles = buildEnhancedProfiles(activeEvents, allEvents, clusters);

  if (profiles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-sm font-medium text-gray-700 mb-1">Нет данных о конкурентах</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Добавьте события с категорией «Конкурент», чтобы увидеть Competitive Intelligence Hub.
        </p>
      </div>
    );
  }

  const selectedProfile = selected ? profiles.find(p => p.name === selected) ?? null : null;
  const selectedRank    = selected ? profiles.findIndex(p => p.name === selected) + 1 : 0;

  return (
    <div>
      {selectedProfile ? (
        <CompetitorDetailView
          profile={selectedProfile}
          rank={selectedRank}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <HubHeader profiles={profiles} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {profiles.map((p, i) => (
              <CompetitorCard
                key={p.name}
                profile={p}
                rank={i + 1}
                onSelect={() => setSelected(p.name)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
