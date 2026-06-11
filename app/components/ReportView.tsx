'use client';

import type { StoredReport, ReportTezis, ReportSection, ReportAction, CorrelationSnapshot } from '@/lib/reportTypes';
import type { TriggerEvent } from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }

const SEVERITY_CONFIG = {
  critical:  { label: '🔴 Критический отчёт', cls: 'bg-red-50 border-red-200 text-red-700' },
  attention: { label: '🟡 Требует внимания',  cls: 'bg-amber-50 border-amber-200 text-amber-700' },
  normal:    { label: '🟢 Обычный отчёт',     cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
};

// ── Atoms ──────────────────────────────────────────────────────────────────────

function ConfidencePill({ score }: { score: number }) {
  const cls =
    score >= 85 ? 'bg-emerald-50 text-emerald-700' :
    score >= 65 ? 'bg-blue-50 text-blue-700' :
    'bg-gray-50 text-gray-500';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {score}% уверенность
    </span>
  );
}

function EventChip({ eventId, snapshots }: { eventId: string; snapshots: TriggerEvent[] }) {
  const event = snapshots.find(e => e.id === eventId);
  if (!event) return null;
  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      title={event.title}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors max-w-[220px]"
    >
      <span className="truncate">📄 {truncate(event.title, 40)}</span>
      <span className="flex-shrink-0 text-blue-400">↗</span>
    </a>
  );
}

function CorrelationChip({ corrId, snapshots }: { corrId: string; snapshots: CorrelationSnapshot[] }) {
  const cluster = snapshots.find(c => c.id === corrId);
  if (!cluster) return null;
  return (
    <span
      title={cluster.insight}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100"
    >
      🔗 {truncate(cluster.label, 35)} · {cluster.strength}
    </span>
  );
}

// ── Tezis ──────────────────────────────────────────────────────────────────────

function TezisBlock({
  tezis, index, eventSnapshots, correlationSnapshots,
}: {
  tezis: ReportTezis;
  index: number;
  eventSnapshots: TriggerEvent[];
  correlationSnapshots: CorrelationSnapshot[];
}) {
  const hasLinks =
    (tezis.sourceEventIds?.length ?? 0) > 0 ||
    (tezis.sourceCorrelationIds?.length ?? 0) > 0;

  return (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs font-bold text-gray-300 flex-shrink-0 w-5 mt-0.5">{index + 1}.</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-800 leading-relaxed mb-1.5">{tezis.text}</p>
        {(hasLinks || tezis.confidenceScore) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {tezis.confidenceScore !== undefined && <ConfidencePill score={tezis.confidenceScore} />}
            {tezis.sourceEventIds?.map(id => (
              <EventChip key={id} eventId={id} snapshots={eventSnapshots} />
            ))}
            {tezis.sourceCorrelationIds?.map(id => (
              <CorrelationChip key={id} corrId={id} snapshots={correlationSnapshots} />
            ))}
          </div>
        )}
        {(tezis.evidenceQuotes?.length ?? 0) > 0 && (
          <div className="mt-2 pl-2 border-l-2 border-gray-100 space-y-0.5">
            {tezis.evidenceQuotes!.map((q, i) => (
              <p key={i} className="text-[10px] text-gray-400 italic leading-snug">&ldquo;{q}&rdquo;</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function SectionBlock({
  section, eventSnapshots, correlationSnapshots, accent,
}: {
  section: ReportSection;
  eventSnapshots: TriggerEvent[];
  correlationSnapshots: CorrelationSnapshot[];
  accent?: string;
}) {
  if (section.tezises.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">{section.title}</h3>
        {section.avgConfidence !== undefined && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            avg {section.avgConfidence}%
          </span>
        )}
      </div>
      <div className={`border rounded-xl px-4 ${accent ?? 'bg-white border-gray-100'}`}>
        {section.tezises.map((t, i) => (
          <TezisBlock
            key={i}
            tezis={t}
            index={i}
            eventSnapshots={eventSnapshots}
            correlationSnapshots={correlationSnapshots}
          />
        ))}
      </div>
    </div>
  );
}

// ── Action ─────────────────────────────────────────────────────────────────────

function ActionBlock({
  action, index, eventSnapshots, correlationSnapshots,
}: {
  action: ReportAction;
  index: number;
  eventSnapshots: TriggerEvent[];
  correlationSnapshots: CorrelationSnapshot[];
}) {
  const hasLinks =
    (action.sourceEventIds?.length ?? 0) > 0 ||
    (action.sourceCorrelationIds?.length ?? 0) > 0;
  return (
    <div className="flex gap-3 bg-white border border-blue-100 rounded-xl px-4 py-3">
      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 leading-snug mb-1">{action.action}</p>
        <div className="flex flex-wrap gap-2 text-[10px] mb-1">
          {action.responsible && (
            <span className="font-medium text-gray-600">{action.responsible}</span>
          )}
          {action.deadline && (
            <span className="text-amber-600 font-medium">до {action.deadline}</span>
          )}
        </div>
        {hasLinks && (
          <div className="flex flex-wrap gap-1 mt-1">
            {action.sourceEventIds?.map(id => (
              <EventChip key={id} eventId={id} snapshots={eventSnapshots} />
            ))}
            {action.sourceCorrelationIds?.map(id => (
              <CorrelationChip key={id} corrId={id} snapshots={correlationSnapshots} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ReportViewProps {
  stored: StoredReport;
}

export default function ReportView({ stored }: ReportViewProps) {
  const { report, eventSnapshots, correlationSnapshots } = stored;
  const severity = SEVERITY_CONFIG[report.reportSeverity] ?? SEVERITY_CONFIG.normal;
  const tb = report.trustBlock;

  const date = new Date(stored.generatedAt).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const trustPills = [
    { label: 'Сигналов',    val: tb.signalCount,                                         cls: 'bg-blue-50 text-blue-700 border-blue-100' },
    { label: 'Источников',  val: tb.sourceCount,                                         cls: 'bg-gray-50 text-gray-700 border-gray-200' },
    { label: 'Конкурентов', val: tb.competitorCount,                                     cls: 'bg-orange-50 text-orange-700 border-orange-100' },
    { label: 'Уверенность', val: tb.avgConfidenceScore > 0 ? `${tb.avgConfidenceScore}%` : '—', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Корреляций',  val: tb.correlationCount,                                    cls: 'bg-purple-50 text-purple-700 border-purple-100' },
  ];

  return (
    <div className="max-w-3xl">
      {/* ── Header ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              Executive Report · {date}
            </p>
            <p className="text-xs font-semibold text-gray-500">Авангард. Профессиональная экипировка</p>
          </div>
          <span className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border flex-shrink-0 ${severity.cls}`}>
            {severity.label}
          </span>
        </div>

        {/* Headline */}
        <p className="text-sm text-gray-900 leading-relaxed font-medium mb-4">{report.headline}</p>

        {/* Trust Block */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Основан на проверенных данных
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {trustPills.map(({ label, val, cls }) => (
              <div key={label} className={`border rounded-lg px-2.5 py-1 text-center min-w-[80px] ${cls}`}>
                <p className="text-sm font-bold">{val}</p>
                <p className="text-[9px] font-medium uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">Период: {tb.period}</p>
        </div>
      </div>

      {/* ── Why It Matters for Avangard ── */}
      {report.avangardImpactSection.tezises.length > 0 && (
        <SectionBlock
          section={{ ...report.avangardImpactSection, title: 'Почему это важно для Авангарда' }}
          eventSnapshots={eventSnapshots}
          correlationSnapshots={correlationSnapshots}
          accent="bg-blue-50 border-blue-100"
        />
      )}

      {/* ── Content sections ── */}
      {report.sections.map((section, i) => (
        <SectionBlock
          key={i}
          section={section}
          eventSnapshots={eventSnapshots}
          correlationSnapshots={correlationSnapshots}
        />
      ))}

      {/* ── Priority Actions ── */}
      {report.priorityActions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Приоритеты недели</h3>
          <div className="space-y-2">
            {report.priorityActions.map((action, i) => (
              <ActionBlock
                key={i}
                action={action}
                index={i}
                eventSnapshots={eventSnapshots}
                correlationSnapshots={correlationSnapshots}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Footnote ── */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-center">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Отчёт сформирован на основе {tb.signalCount} {tb.signalCount === 1 ? 'события' : 'событий'} из {tb.sourceCount} источников.
          Каждый вывод привязан к источнику — нажмите ↗ для проверки.
          {tb.avgConfidenceScore > 0 && ` Средняя уверенность по данным: ${tb.avgConfidenceScore}%.`}
        </p>
      </div>
    </div>
  );
}
