import { type NextRequest } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { formatCompanyContext } from '@/lib/company';
import type { TriggerEvent } from '@/lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  news: 'Новость',
  tender: 'Тендер',
  competitor: 'Конкурент',
  regulation: 'Регуляторика',
  other: 'Прочее',
};

const IMPORTANCE_LABELS: Record<string, string> = {
  critical: 'Критично',
  high: 'Важно',
  medium: 'Средне',
  low: 'Фон',
};

function formatEvent(e: TriggerEvent, i: number): string {
  const lines: string[] = [
    `${i + 1}. [${CATEGORY_LABELS[e.category] ?? e.category}${e.importance ? ' · ' + (IMPORTANCE_LABELS[e.importance] ?? e.importance) : ''}] ${e.title}`,
    `   Дата: ${new Date(e.date).toLocaleDateString('ru-RU')}`,
    `   Источник: ${e.url}`,
  ];

  if (e.whatHappened) {
    lines.push(`   Что произошло: ${e.whatHappened}`);
  } else {
    lines.push(`   Резюме: ${e.summary}`);
  }

  // Support both new and old field name for backward compat
  const whyMatters = e.whyItMattersForAvangard ?? e.whyItMattersForWorkwear;
  if (whyMatters) {
    lines.push(`   Влияние на Авангард: ${whyMatters}`);
  }

  if (e.avangardImpact) {
    lines.push(`   Оценка влияния на Авангард: ${IMPORTANCE_LABELS[e.avangardImpact.level] ?? e.avangardImpact.level} — ${e.avangardImpact.reason}`);
  }

  if (e.opportunities?.length) {
    lines.push(`   Возможности: ${e.opportunities.join(' | ')}`);
  }

  if (e.threats?.length) {
    lines.push(`   Угрозы: ${e.threats.join(' | ')}`);
  }

  if (e.suggestedAction) {
    lines.push(`   Рекомендация: ${e.suggestedAction}`);
  } else if (e.signals?.length) {
    lines.push(`   Сигналы: ${e.signals.join(' | ')}`);
  }

  if (e.competitorName) {
    lines.push(`   Конкурент: ${e.competitorName}`);
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  let events: TriggerEvent[];

  try {
    const body = await request.json();
    events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      return Response.json({ error: 'Нет событий для брифа' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const eventsText = events.map(formatEvent).join('\n\n');

  const prompt = `Роль: внутренний аналитик компании Авангард. Профессиональная экипировка. Бриф читает директор — человек, принимающий стратегические и продуктовые решения.

ПРОФИЛЬ АВАНГАРДА:
${formatCompanyContext()}

СОБЫТИЯ НЕДЕЛИ:
${eventsText}

ЖЁСТКИЕ ПРАВИЛА:
- Ни одного предложения без конкретики: цифры, названия, сроки, сегменты
- Всё через призму Авангарда: не "рынок", а "Авангард" как субъект
- Раздел "Что это значит для Авангарда" — только структурные выводы, не пересказ событий
- Возможности: [направление/сегмент Авангарда] + действие + окно/объём
- Угрозы: [актор/фактор] + механизм + масштаб для Авангарда
- Рекомендации: кто в Авангарде + что делает + измеримый результат

Напиши бриф строго в следующем формате (только текст, без markdown-символов):

НЕДЕЛЬНЫЙ БРИФ — АВАНГАРД. ПРОФЕССИОНАЛЬНАЯ ЭКИПИРОВКА

ГЛАВНОЕ ЗА НЕДЕЛЮ
[2–3 предложения: только самые значимые для Авангарда события — без перечисления всего]

ЧТО ЭТО ЗНАЧИТ ДЛЯ АВАНГАРДА
[Структурный вывод: как изменилась конкурентная позиция Авангарда, спрос на его продукты или производственные условия. Не пересказывать события.]

КОНКУРЕНТНЫЕ СИГНАЛЫ
[Кто из конкурентов что сделал, с каким эффектом для Авангарда — или "—"]

РЕГУЛЯТОРИКА
[НПА, орган, срок вступления в силу, кого затрагивает из продуктов Авангарда — или "—"]

МАТЕРИАЛЫ И ТЕХНОЛОГИИ
[Новые материалы, ткани, технологии, релевантные для производства Авангарда — или "—"]

ПРОИЗВОДСТВО И ПОСТАВЩИКИ
[Изменения в цепочке поставок, новые заводы, партнёрства, релевантные для Авангарда — или "—"]

ВОЗМОЖНОСТИ
[Конкретные: направление/сегмент Авангарда + действие + временное окно — или "—"]

УГРОЗЫ
[Конкретные: актор + механизм угрозы для Авангарда + срок — или "—"]

РЕКОМЕНДУЕМЫЕ ДЕЙСТВИЯ
[Конкретные шаги: кто в Авангарде + что + измеримый результат]

ПРИОРИТЕТЫ НА СЛЕДУЮЩУЮ НЕДЕЛЮ
1. [Действие: кто + что + ожидаемый результат]
2. [...]
3. [...]`;

  try {
    const brief = await callGemini(prompt, false);
    return Response.json({ brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return Response.json({ error: `Ошибка генерации брифа: ${msg}` }, { status: 500 });
  }
}
