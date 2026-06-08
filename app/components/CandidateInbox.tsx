'use client';

import type { Candidate } from '@/lib/types';

interface CandidateInboxProps {
  candidates: Candidate[];
  analyzingId: string | null;
  onAnalyze: (candidate: Candidate) => void;
  onIgnore: (id: string) => void;
}

export default function CandidateInbox({ candidates, analyzingId, onAnalyze, onIgnore }: CandidateInboxProps) {
  const newCandidates = candidates.filter(c => c.status === 'new');
  const doneCandidates = candidates.filter(c => c.status !== 'new');

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const truncate = (str: string, n: number) => str.length > n ? str.slice(0, n) + '…' : str;

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Кандидатов пока нет</p>
        <p className="text-xs text-gray-400">Нажмите «Проверить источники» на вкладке Источники</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Найденные материалы</h2>
        <p className="text-xs text-gray-400 mt-0.5">{newCandidates.length} новых · {doneCandidates.length} обработано</p>
      </div>

      {newCandidates.length > 0 && (
        <div className="space-y-2">
          {newCandidates.map(candidate => (
            <div key={candidate.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {candidate.sourceName}
                    </span>
                    <span className="text-xs text-gray-300">{formatDate(candidate.detectedAt)}</span>
                  </div>
                  <p className="text-sm text-gray-900 font-medium leading-snug mb-1">
                    {truncate(candidate.title, 120)}
                  </p>
                  <p className="text-xs text-blue-600 mb-1">{candidate.reason}</p>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-400 hover:text-gray-600 truncate block max-w-md transition-colors"
                  >
                    {truncate(candidate.url, 80)}
                  </a>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => onAnalyze(candidate)}
                    disabled={analyzingId === candidate.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {analyzingId === candidate.id ? (
                      <>
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Анализ...
                      </>
                    ) : 'Анализировать'}
                  </button>
                  <button
                    onClick={() => onIgnore(candidate.id)}
                    className="px-3 py-1.5 text-gray-400 text-xs font-medium rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    Игнорировать
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {doneCandidates.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">Обработано</p>
          <div className="space-y-1.5">
            {doneCandidates.map(candidate => (
              <div key={candidate.id} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-lg opacity-60">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${candidate.status === 'analyzed' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                  {candidate.status === 'analyzed' ? 'Проанализировано' : 'Игнорируется'}
                </span>
                <span className="text-xs text-gray-500 truncate flex-1">{truncate(candidate.title, 80)}</span>
                <span className="text-xs text-gray-300 flex-shrink-0">{candidate.sourceName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
