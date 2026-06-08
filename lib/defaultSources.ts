import type { Source, SourceType, SourcePriority } from './types';

type SourceSeed = Omit<Source, 'id' | 'createdAt'>;

const SEEDS: SourceSeed[] = [
  // Конкуренты
  { name: 'Техноавиа', url: 'https://www.technoavia.ru/', type: 'competitor', active: true, priority: 'high' },
  { name: 'Восток-Сервис', url: 'https://www.vostok-service.ru/', type: 'competitor', active: true, priority: 'high' },
  { name: 'Урсус', url: 'https://ursus.ru/', type: 'competitor', active: true, priority: 'medium' },
  { name: 'СОЮЗСПЕЦОДЕЖДА', url: 'https://soyuzspecodezhda.ru/', type: 'competitor', active: true, priority: 'medium' },
  // Тендеры
  // TODO: уточнить URL раздела спецодежды на B2B-Center (главная не содержит релевантных ссылок).
  // Пример поиска: https://www.b2b-center.ru/market/?searchText=спецодежда — требует проверки доступности.
  { name: 'B2B-Center', url: 'https://www.b2b-center.ru/', type: 'tender', active: true, priority: 'high' },
  { name: 'Госзакупки (ЕИС)', url: 'https://zakupki.gov.ru/', type: 'tender', active: true, priority: 'high' },
  // Регуляторика
  { name: 'Минпромторг', url: 'https://minpromtorg.gov.ru/', type: 'regulation', active: true, priority: 'high' },
  { name: 'КонсультантПлюс', url: 'https://www.consultant.ru/', type: 'regulation', active: true, priority: 'medium' },
  { name: 'Гарант', url: 'https://www.garant.ru/', type: 'regulation', active: false, priority: 'low' },
  // Материалы / технологии
  { name: 'Охрана труда (портал)', url: 'https://www.ohranatruda.ru/', type: 'material', active: false, priority: 'low' },
  { name: 'Спецодежда.ру (рынок)', url: 'https://specodezhda.ru/', type: 'material', active: false, priority: 'low' },
];

export function buildDefaultSources(): Source[] {
  const now = new Date().toISOString();
  return SEEDS.map((seed, i) => ({
    ...seed,
    id: `default-${i}`,
    createdAt: now,
  }));
}

export { type SourceType, type SourcePriority };
