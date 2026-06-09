'use client';

import { useState } from 'react';
import type { TriggerEvent, EventCategory, EventImportance, EvidenceBlock, ImpactLevel, AvangardDirection } from '@/lib/types';
import { expiryLabel } from '@/lib/eventLifecycle';

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

const IL_BADGE: Record<ImpactLevel, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-gray-100 text-gray-500',
  none:   'hidden',
};
const IL_LABEL: Record<ImpactLevel, string> = { high: 'High', medium: 'Med', low: 'Low', none: '' };

const BIZ_DIMS: Array<{ key: keyof NonNullable<TriggerEvent['businessImpact']>; label: string }> = [
  { key: 'sales',       label: 'Продажи' },
  { key: 'procurement', label: 'Закупки' },
  { key: 'production',  label: 'Производство' },
  { key: 'marketing',   label: 'Маркетинг' },
  { key: 'product',     label: 'Продукт' },
];

const CATEGORY_LABELS: Record<EventCategory, string> = {
  news: 'Новости',
  tender: 'Тендер',
  competitor: 'Конкурент',
  regulation: 'Регуляторика',
  other: 'Прочее',
};

const CATEGORY_STYLES: Record<EventCategory, string> = {
  news: 'bg-blue-50 text-blue-700 border-blue-100',
  tender: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  competitor: 'bg-orange-50 text-orange-700 border-orange-100',
  regulation: 'bg-purple-50 text-purple-700 border-purple-100',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

const IMPORTANCE_LABELS: Record<EventImportance, string> = {
  critical: 'Критично',
  high: 'Важно',
  medium: 'Средне',
  low: 'Фон',
};

const IMPORTANCE_STYLES: Record<EventImportance, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
};

const IMPORTANCE_DOT: Record<EventImportance, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-gray-300',
};

// Avangard impact badge — indigo/violet palette to distinguish from market importance
const AVANGARD_IMPACT_STYLES: Record<EventImportance, string> = {
  critical: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  high: 'bg-violet-100 text-violet-700 border-violet-200',
  medium: 'bg-sky-50 text-sky-700 border-sky-100',
  low: 'bg-slate-100 text-slate-500 border-slate-200',
};

interface EventCardProps {
  event: TriggerEvent;
  onToggleMark: () => void;
  onDelete: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      {children}
    </div>
  );
}

function BulletList({ items, color = 'gray' }: { items: string[]; color?: 'gray' | 'green' | 'red' | 'blue' }) {
  const dotColor = { gray: 'bg-gray-400', green: 'bg-emerald-500', red: 'bg-red-400', blue: 'bg-blue-400' }[color];
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function EvidenceNote({ ev }: { ev: EvidenceBlock }) {
  const [open, setOpen] = useState(false);
  if (!ev.quotes.length && !ev.interpretation) return null;
  return (
    <div className="mt-1">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors underline-offset-2 hover:underline"
      >
        {open ? 'Скрыть основание' : 'Показать основание'}
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-gray-100 pl-2.5 space-y-1">
          {ev.quotes.map((q, i) => (
            <p key={i} className="text-[11px] text-gray-400 italic leading-snug">«{q}»</p>
          ))}
          {ev.interpretation && (
            <p className="text-[11px] text-teal-600 leading-snug">
              <span className="font-semibold not-italic">ИИ:</span> {ev.interpretation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceBulletList({
  items,
  evidence,
  color = 'gray',
}: {
  items: string[];
  evidence?: EvidenceBlock[];
  color?: 'gray' | 'green' | 'red' | 'blue';
}) {
  const dotColor = { gray: 'bg-gray-400', green: 'bg-emerald-500', red: 'bg-red-400', blue: 'bg-blue-400' }[color];
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
          <div className="flex-1 min-w-0">
            <span>{item}</span>
            {evidence?.[i] && <EvidenceNote ev={evidence[i]} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function EventCard({ event, onToggleMark, onDelete }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedDate = new Date(event.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const archived = event.status === 'archived';
  const expiry   = expiryLabel(event);

  const domain = (() => {
    try {
      return new URL(event.url).hostname.replace('www.', '');
    } catch {
      return event.url.slice(0, 40);
    }
  })();

  // Support both new and old field name for backward compat with stored events
  const whyMattersText = event.whyItMattersForAvangard ?? event.whyItMattersForWorkwear;
  const whyMattersEvidence = event.evidence?.whyItMattersForAvangard;

  const hasExtended = !!(
    event.whatHappened ||
    whyMattersText ||
    event.avangardImpact?.reason ||
    event.consequences?.length ||
    event.opportunities?.length ||
    event.threats?.length ||
    event.suggestedAction ||
    event.signals?.length ||
    (event.businessImpact && Object.keys(event.businessImpact).length > 0) ||
    event.competitorIntel?.overlap.length
  );

  return (
    <article
      className={`bg-white rounded-xl border transition-all ${
        archived
          ? 'border-gray-100 opacity-60'
          : event.markedForBrief
          ? 'border-blue-300 shadow-sm shadow-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={event.markedForBrief}
            onChange={onToggleMark}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
            title="Отметить для еженедельного брифа"
          />

          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span
                className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${CATEGORY_STYLES[event.category]}`}
              >
                {CATEGORY_LABELS[event.category]}
              </span>

              {event.importance && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${IMPORTANCE_STYLES[event.importance]}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${IMPORTANCE_DOT[event.importance]}`} />
                  {IMPORTANCE_LABELS[event.importance]}
                </span>
              )}

              {event.avangardImpact && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${AVANGARD_IMPACT_STYLES[event.avangardImpact.level]}`}
                  title={event.avangardImpact.reason}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                  </svg>
                  А · {IMPORTANCE_LABELS[event.avangardImpact.level]}
                </span>
              )}

              {event.confidenceScore !== undefined && (
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${
                    event.confidenceScore >= 70
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : event.confidenceScore >= 50
                      ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                      : 'bg-red-50 text-red-600 border-red-100'
                  }`}
                  title="Уверенность модели в анализе"
                >
                  {event.confidenceScore >= 70 ? '🟢' : event.confidenceScore >= 50 ? '🟡' : '🔴'} {event.confidenceScore}%
                </span>
              )}

              {event.competitorName && (
                <span className="inline-block text-xs font-medium px-2 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-100">
                  {event.competitorName}
                </span>
              )}

              <span className="text-xs text-gray-400">{formattedDate}</span>
              <span className="text-gray-200">·</span>
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-blue-600 truncate max-w-[160px] transition-colors"
              >
                {domain}
              </a>
              {event.sourceType && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400 italic">{event.sourceType}</span>
                </>
              )}

              {archived && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 uppercase tracking-wide">
                  Архив
                </span>
              )}

              {!archived && expiry && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    expiry.level === 'ok'   ? 'bg-emerald-50 text-emerald-600' :
                    expiry.level === 'soon' ? 'bg-amber-50 text-amber-600' :
                                             'bg-gray-100 text-gray-400'
                  }`}
                  title="Дата истечения события"
                >
                  {expiry.text}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
              {event.title}
            </h3>

            {/* Summary — always visible */}
            <p className="text-sm text-gray-600 leading-relaxed">
              {event.summary}
            </p>

            {/* Expanded content */}
            {expanded && (
              <div className="mt-3 space-y-0 border-t border-gray-100 pt-3">

                {event.whatHappened && (
                  <Section title="Что произошло">
                    <p className="text-xs text-gray-600 leading-relaxed">{event.whatHappened}</p>
                  </Section>
                )}

                {event.avangardImpact?.reason && (
                  <Section title="Влияние на Авангард">
                    <p className="text-xs text-gray-600 leading-relaxed">{event.avangardImpact.reason}</p>
                  </Section>
                )}

                {whyMattersText && (
                  <Section title="Почему важно для Авангарда">
                    <p className="text-xs text-gray-600 leading-relaxed">{whyMattersText}</p>
                    {whyMattersEvidence && <EvidenceNote ev={whyMattersEvidence} />}
                  </Section>
                )}

                {event.signals && event.signals.length > 0 && (
                  <Section title="Ранние сигналы">
                    <BulletList items={event.signals} color="blue" />
                  </Section>
                )}

                {event.consequences && event.consequences.length > 0 && (
                  <Section title="Последствия">
                    <BulletList items={event.consequences} color="gray" />
                  </Section>
                )}

                {event.opportunities && event.opportunities.length > 0 && (
                  <Section title="Возможности">
                    <EvidenceBulletList
                      items={event.opportunities}
                      evidence={event.evidence?.opportunities}
                      color="green"
                    />
                  </Section>
                )}

                {event.threats && event.threats.length > 0 && (
                  <Section title="Угрозы">
                    <EvidenceBulletList
                      items={event.threats}
                      evidence={event.evidence?.threats}
                      color="red"
                    />
                  </Section>
                )}

                {/* Phase 3: Business Impact */}
                {event.businessImpact && Object.keys(event.businessImpact).length > 0 && (
                  <Section title="Business Impact">
                    {event.businessImpactReason && (
                      <p className="text-xs text-gray-500 mb-2 leading-relaxed">{event.businessImpactReason}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {BIZ_DIMS.map(({ key, label }) => {
                        const level = event.businessImpact![key];
                        if (!level || level === 'none') return null;
                        return (
                          <span key={key} className={`text-[10px] font-semibold px-2 py-0.5 rounded ${IL_BADGE[level]}`}>
                            {label}: {IL_LABEL[level]}
                          </span>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* Phase 3: Competitor Intel */}
                {event.competitorIntel && event.competitorIntel.overlap.length > 0 && (
                  <Section title="Overlap с Авангардом">
                    <div className="flex flex-wrap gap-1.5">
                      {event.competitorIntel.overlap.map(dir => (
                        <span key={dir} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                          {DIR_LABEL[dir]}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {event.suggestedAction && (
                  <Section title="Рекомендованное действие">
                    <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-700 font-medium leading-relaxed">{event.suggestedAction}</p>
                        {event.evidence?.suggestedAction && (
                          <EvidenceNote ev={event.evidence.suggestedAction} />
                        )}
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            )}

            {hasExtended && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                {expanded ? 'Свернуть' : 'Подробнее'}
              </button>
            )}
          </div>

          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
            title="Удалить событие"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
