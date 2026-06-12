/**
 * lib/companyKnowledge.ts
 *
 * Корпоративная память Авангарда — единый источник истины.
 * Фаза KB-0: архитектура + миграция существующих данных.
 *
 * Данные заполнены ровно настолько, насколько они известны:
 *   ✓ = перенесено из существующего кода
 *   ○ = поле существует, данные отсутствуют — заполнять в KB-1..KB-3
 *
 * Этот файл не подключён ни к каким компонентам.
 * lib/company.ts сохраняется без изменений для обратной совместимости.
 */

import type { AvangardDirection } from './types';

// ── Interfaces ─────────────────────────────────────────────────────────────────

/** Базовый профиль компании */
export interface CompanyProfile {
  name: string;
  shortName: string;
  positioning: string;
  /** Ключевые конкурентные преимущества */
  strengths: string[];
  // ○ KB-1: год основания, если нужен для контекста анализа
  founded?: number;
  // ○ KB-1: местоположение производства — нужно для тендерных требований о локализации
  headquarters?: string;
}

/**
 * Продуктовая категория верхнего уровня.
 * KB-0: только 3 грубые категории из company.ts.
 * KB-1: добавить конкретные линейки (flame-resistant, membrane и т.д.)
 */
export interface ProductCategory {
  id: string;
  name: string;
  /** Основное направление из AvangardDirection (один root-уровень) */
  direction: AvangardDirection;
  /**
   * Входит ли в CORE_DIRS — приоритетные направления Авангарда.
   * Источник: CORE_DIRS из lib/competitorIntelHelpers.ts
   */
  isCoreLine: boolean;
  /**
   * ○ KB-1: целевые отрасли для этой продуктовой линейки.
   * Пример: ['oil-gas', 'metallurgy'] для flame-resistant
   */
  targetIndustryIds: string[];
  /**
   * ○ KB-1: ГОСТы, которые Авангард имеет / должен иметь для этой линейки.
   * ВАЖНО: не придумывать — вносить только подтверждённые данные.
   * Пример: ['ГОСТ Р 12.4.221', 'ТР ТС 019/2011']
   */
  keyGosts: string[];
  /**
   * ○ KB-2: ценовой сегмент — нужен для оценки конкурентных угроз.
   * Если Техноавиа атакует premium, а мы mass-market — угроза ниже.
   */
  priceSegment?: 'premium' | 'medium' | 'budget';
  /** ○ KB-1: краткое описание продуктовой линейки */
  description?: string;
}

/**
 * Продуктовая линейка — второй уровень детализации ProductCategory.
 * KB-1: 11 конкретных линеек Авангарда.
 * Данные: только безопасные поля — certificationStatus='unknown', keyGosts=[].
 */
export interface ProductLine {
  id: string;
  name: string;
  /** Верхняя категория */
  parentCategory: 'workwear' | 'footwear' | 'ppe';
  /**
   * Одно или несколько направлений AvangardDirection.
   * Массив нужен: Зимняя спецодежда = ['workwear', 'membranes'],
   * Антистатическая обувь = ['footwear', 'antistatic'].
   */
  directions: AvangardDirection[];
  /** Отрасли применения. IDs из industries[]. */
  targetIndustryIds: string[];
  /** IDs из materials[]. Только материалы, перечисленные в company.ts. */
  relatedMaterialIds: string[];
  /** IDs из technologies[]. Только технологии из company.ts. */
  relatedTechnologyIds: string[];
  /**
   * ГОСТы — ТОЛЬКО подтверждённые.
   * Дефолт: [] — не заполнять без верификации документов.
   * Риск галлюцинаций высокий — не передавать пустой массив в Gemini-промпт.
   */
  keyGosts: string[];
  /**
   * Статус сертификации.
   * 'unknown' — безопасный дефолт для всех линеек KB-1.
   * 'confirmed' ставить только при наличии реального документа.
   * В Gemini-промпт включать только 'confirmed' записи.
   */
  certificationStatus: 'confirmed' | 'pending' | 'unknown';
  /** Входит ли в CORE_DIRS — влияет на ThreatScore в CompetitiveIntelHub. */
  isCoreLine: boolean;
  /** ○ KB-2: только с реальными данными о ценообразовании */
  priceSegment?: 'premium' | 'medium' | 'budget';
}

/** Отраслевой профиль клиентской базы */
export interface IndustryProfile {
  id: string;
  name: string;
  /**
   * Совпадает ли с AvangardDirection.
   * Часть отраслей (горнодобывающая, пищевая) не представлены
   * в AvangardDirection — для них direction = undefined.
   */
  direction?: AvangardDirection;
  /**
   * Входит ли в CORE_DIRS — приоритетные для ThreatScore.
   * Источник: CORE_DIRS из lib/competitorIntelHelpers.ts
   */
  isCore: boolean;
  /**
   * ○ KB-3: примерная доля выручки — нужна для приоритизации угроз.
   * Пример: '35%' означает, что потеря этой отрасли критична
   */
  revenueShare?: string;
  /**
   * ○ KB-3: ключевые клиенты в отрасли — нужны для оценки тендерных угроз.
   * Пример: ['Газпром', 'Роснефть', 'ЛУКОЙЛ'] для нефтегаза
   */
  keyClients: string[];
  /**
   * ○ KB-3: стратегический приоритет отрасли.
   * 'protect' = защищаем текущую долю
   * 'grow' = активно расширяемся
   * 'watch' = мониторим без активных инвестиций
   */
  strategicPriority?: 'protect' | 'grow' | 'watch';
}

/** Профиль конкурента — единый источник истины для всего приложения */
export interface CompetitorProfile {
  id: string;
  /** Каноническое название — используется во всех компонентах */
  name: string;
  /**
   * Домены для автоматической классификации URL.
   * Источник: COMPETITOR_DOMAINS в analyze/route.ts +
   *            DOMAIN_MAP в CompetitorWatch.tsx +
   *            domain map в competitorIntelHelpers.ts
   * Формат: hostname без www., например 'technoavia.ru'
   */
  domains: string[];
  /**
   * Паттерн для поиска в hostname (hostname.includes(pattern)).
   * Используется в analyze/route.ts для preclassifySource().
   * Обычно = основа домена без .ru/.com
   */
  hostnamePatterns: string[];
  /**
   * ○ KB-2: продуктовые специализации конкурента.
   * Заполнить только подтверждёнными данными.
   * Пример: ['flame-resistant', 'membranes'] для Техноавиа
   */
  productSpecializations: AvangardDirection[];
  /**
   * ○ KB-2: ценовое позиционирование относительно Авангарда.
   * 'higher' | 'similar' | 'lower'
   */
  pricePosition?: 'higher' | 'similar' | 'lower';
  /**
   * ○ KB-2: отрасли, где конкурент особенно силён.
   * Используется для оценки пересечений в CompetitiveIntelHub
   */
  strongIndustries: string[];
  /**
   * ○ KB-2: общая оценка угрозы для Авангарда.
   * Не заполнять автоматически — только на основе реальных данных.
   */
  threatLevel?: 'high' | 'medium' | 'low';
  /** ○ KB-2: произвольная заметка (откуда поставляют, чем отличаются) */
  notes?: string;
}

/**
 * Стратегический профиль — чего Авангард хочет достичь.
 * KB-0: полностью пуст — заполнять в KB-3 после согласования с руководством.
 */
export interface StrategyProfile {
  /**
   * ○ KB-3: что защищаем — отрасли/продукты, где потеря доли критична.
   * Пример: ['нефтегаз: мембранная линейка', 'металлургия: огнестойкость']
   */
  defensePriorities: string[];
  /**
   * ○ KB-3: куда активно идём — новые отрасли или продукты.
   * Пример: ['антистатика для химии', 'сертификация под новый ГОСТ в энергетике']
   */
  growthTargets: string[];
  /**
   * ○ KB-3: один-два абзаца текущего фокуса.
   * Используется в Gemini-промптах для контекста анализа.
   */
  currentFocus?: string;
  /**
   * ○ KB-3: плановый горизонт стратегии.
   * Пример: 'H1 2026', '2026–2027'
   */
  horizon?: string;
}

/**
 * Тендерный профиль — параметры, которые делают тендер релевантным.
 * KB-0: полностью пуст — критически нужен для KB-3.
 */
export interface TenderProfile {
  /**
   * ○ KB-3: минимальный НМЦ в рублях, ниже которого участие нецелесообразно.
   * Пример: 5_000_000 (5 млн руб.)
   */
  minNMC?: number;
  /**
   * ○ KB-3: максимальный НМЦ (если есть ограничения производственных мощностей).
   */
  maxNMC?: number;
  /**
   * ○ KB-3: предпочтительные типы заказчиков.
   * Пример: ['госпредприятие', 'промышленный холдинг']
   */
  preferredCustomerTypes: string[];
  /**
   * ○ KB-3: предпочтительные отрасли для тендерного участия.
   * Пример: ['нефтегаз', 'металлургия', 'строительство']
   */
  preferredIndustryIds: string[];
  /**
   * ○ KB-3: подтверждённые квалификации для участия в тендерах.
   * Пример: ['российское юрлицо', 'опыт поставок от 3 лет', 'ГОСТ-сертификаты']
   */
  qualifications: string[];
  /**
   * ○ KB-3: реестры, в которых Авангард зарегистрирован.
   * Пример: ['ГИСП', 'РТС-Тендер', 'B2B-Center']
   */
  activeRegistries: string[];
}

/**
 * Сертификат или стандарт соответствия.
 * KB-0: массив пуст — КРИТИЧНО заполнить в KB-1.
 * Без этих данных Gemini не может определить, создаёт ли
 * новый ГОСТ угрозу (нужна пересертификация) или возможность (уже есть сертификат).
 */
export interface Certification {
  id: string;
  /** Номер стандарта. Пример: 'ГОСТ Р 12.4.221', 'ТР ТС 019/2011' */
  standard: string;
  /** Человекочитаемое название */
  name?: string;
  /** Область применения. Пример: 'огнестойкая спецодежда для нефтегаза' */
  scope: string;
  /** Текущий статус */
  status: 'current' | 'pending' | 'expired';
  /** ○ KB-1: дата окончания действия сертификата */
  validUntil?: string;
  /** ○ KB-1: ID продуктовых категорий, которые покрывает сертификат */
  productIds: string[];
}

/** Технологический профиль */
export interface TechnologyProfile {
  id: string;
  name: string;
  /** ○ KB-1: описание для контекста Gemini-анализа */
  description?: string;
  /** ○ KB-1: продуктовые категории, где применяется технология */
  productIds: string[];
  /**
   * ○ KB-2: конкурентная позиция Авангарда по этой технологии.
   * 'leader' = лидируем / 'parity' = наравне / 'lagging' = отстаём
   */
  competitiveEdge?: 'leader' | 'parity' | 'lagging';
}

/** Профиль материала */
export interface MaterialProfile {
  id: string;
  name: string;
  /**
   * ○ KB-1: текущие поставщики.
   * Пример: ['Ивановский химволокно', 'DuPont (импорт)']
   */
  suppliers: string[];
  /**
   * ○ KB-2: тип текущего источника закупок.
   * Нужен для оценки рисков импортозамещения.
   */
  source?: 'domestic' | 'import' | 'mixed';
  /** ○ KB-1: продуктовые категории, где применяется материал */
  productIds: string[];
  /**
   * ○ KB-2: критичность для производства.
   * 'high' = нет альтернативы / 'low' = легко заменяемо
   */
  criticalityLevel?: 'high' | 'medium' | 'low';
}

/** Корневой тип корпоративной памяти */
export interface CompanyKnowledge {
  company: CompanyProfile;
  products: ProductCategory[];
  productLines: ProductLine[];
  industries: IndustryProfile[];
  competitors: CompetitorProfile[];
  strategy: StrategyProfile;
  tenders: TenderProfile;
  certifications: Certification[];
  technologies: TechnologyProfile[];
  materials: MaterialProfile[];
}

// ── Data ───────────────────────────────────────────────────────────────────────

/**
 * Единый корпоративный KB Авангарда.
 *
 * Статус полей:
 *   ✓ = данные перенесены из существующего кода
 *   ○ = поле определено, данные отсутствуют
 */
export const COMPANY_KNOWLEDGE: CompanyKnowledge = {

  // ── company ──────────────────────────────────────────────────────────────────
  // ✓ Источник: AVANGARD.name / .positioning / .strengths из lib/company.ts

  company: {
    name:       'Авангард. Профессиональная экипировка',
    shortName:  'Авангард',
    positioning:
      'Инженер-эксперт и надёжный партнёр в области профессиональной экипировки. ' +
      'Собственное производство спецодежды, спецобуви и СИЗ. ' +
      'Упор на материаловедение, инновационные технологии и эргономику. ' +
      'Комплексные системы экипировки — от одежды до обуви и СИЗ.',
    strengths: [
      'Полный цикл производства: спецодежда, спецобувь, СИЗ',
      'Инженерный и материаловедческий подход к разработке',
      'Эргономика и комфорт как конкурентное преимущество',
      'Комплексные системы профессиональной экипировки',
      'Инновационные технологии пошива и обработки материалов',
    ],
    // ○ KB-1: headquarters — нужно для тендерных требований о российском производстве
    // ○ KB-1: founded — для контекста позиционирования
  },

  // ── products ─────────────────────────────────────────────────────────────────
  // ✓ Источник: AVANGARD.productDirections из lib/company.ts (3 категории)
  // ✓ isCoreLine: из CORE_DIRS в lib/competitorIntelHelpers.ts
  //              CORE_DIRS = { workwear, ppe, flame-resistant, oil-gas, metallurgy, membranes }
  // ○ KB-1: добавить конкретные линейки (flame-resistant, membrane, antistatic и т.д.)
  // ○ KB-1: заполнить keyGosts — ТОЛЬКО подтверждёнными данными

  products: [
    {
      id:               'workwear',
      name:             'Спецодежда',
      direction:        'workwear',
      isCoreLine:       true,   // workwear ∈ CORE_DIRS
      targetIndustryIds: [],    // ○ KB-1: ['oil-gas', 'metallurgy', 'construction', ...]
      keyGosts:         [],     // ○ KB-1: ГОСТы Авангарда на спецодежду
      // ○ KB-2: priceSegment
    },
    {
      id:               'footwear',
      name:             'Спецобувь',
      direction:        'footwear',
      isCoreLine:       false,  // footwear ∉ CORE_DIRS
      targetIndustryIds: [],    // ○ KB-1
      keyGosts:         [],     // ○ KB-1
    },
    {
      id:               'ppe',
      name:             'СИЗ',
      direction:        'ppe',
      isCoreLine:       true,   // ppe ∈ CORE_DIRS
      targetIndustryIds: [],    // ○ KB-1
      keyGosts:         [],     // ○ KB-1
    },
  ],

  // ── productLines ─────────────────────────────────────────────────────────────
  // KB-1: 11 линеек. Заполнены только безопасные поля.
  // keyGosts: [] — не заполнять без верификации реальных документов.
  // certificationStatus: 'unknown' — безопасный дефолт.
  // isCoreLine: производное от CORE_DIRS = { workwear, ppe, flame-resistant, membranes, oil-gas, metallurgy }

  productLines: [

    // ── workwear ────────────────────────────────────────────────────────────────

    {
      id:                   'flame-resistant-workwear',
      name:                 'Огнестойкая спецодежда',
      parentCategory:       'workwear',
      directions:           ['flame-resistant'],         // flame-resistant ∈ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'metallurgy', 'energy', 'chemicals'],
      relatedMaterialIds:   ['flame-resistant-fabrics', 'aramid-fibers'],
      relatedTechnologyIds: ['flame-antistatic'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           true,
    },
    {
      id:                   'antistatic-workwear',
      name:                 'Антистатическая спецодежда',
      parentCategory:       'workwear',
      directions:           ['antistatic'],              // antistatic ∉ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'chemicals', 'energy'],
      relatedMaterialIds:   ['antistatic-materials'],
      relatedTechnologyIds: ['flame-antistatic'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },
    {
      id:                   'membrane-workwear',
      name:                 'Мембранная спецодежда',
      parentCategory:       'workwear',
      directions:           ['membranes', 'workwear'],   // membranes ∈ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'construction', 'mining'],
      relatedMaterialIds:   ['membrane-fabrics'],
      relatedTechnologyIds: ['membranes', 'moisture-wicking'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           true,
    },
    {
      id:                   'hi-vis-workwear',
      name:                 'Сигнальная одежда',
      parentCategory:       'workwear',
      directions:           ['hi-vis'],                  // hi-vis ∉ CORE_DIRS
      targetIndustryIds:    ['construction', 'energy'],
      relatedMaterialIds:   ['reflective-materials'],
      relatedTechnologyIds: ['hi-vis-finish'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },
    {
      id:                   'winter-workwear',
      name:                 'Зимняя спецодежда',
      parentCategory:       'workwear',
      directions:           ['workwear', 'membranes'],   // workwear, membranes ∈ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'construction', 'metallurgy', 'mining'],
      relatedMaterialIds:   ['membrane-fabrics', 'high-strength-synthetics'],
      relatedTechnologyIds: ['membranes', 'moisture-wicking'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           true,
    },
    {
      id:                   'summer-workwear',
      name:                 'Летняя спецодежда',
      parentCategory:       'workwear',
      directions:           ['workwear'],                // workwear ∈ CORE_DIRS
      targetIndustryIds:    ['construction', 'chemicals', 'food'],
      relatedMaterialIds:   ['high-strength-synthetics'],
      relatedTechnologyIds: ['ergonomic-cut'],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           true,
    },

    // ── footwear ────────────────────────────────────────────────────────────────

    {
      id:                   'protective-footwear',
      name:                 'Защитная спецобувь',
      parentCategory:       'footwear',
      directions:           ['footwear'],                // footwear ∉ CORE_DIRS
      targetIndustryIds:    ['construction', 'metallurgy', 'oil-gas'],
      relatedMaterialIds:   [],
      relatedTechnologyIds: [],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },
    {
      id:                   'antistatic-footwear',
      name:                 'Антистатическая спецобувь',
      parentCategory:       'footwear',
      directions:           ['footwear', 'antistatic'],  // ∉ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'chemicals', 'energy'],
      relatedMaterialIds:   ['antistatic-materials'],
      relatedTechnologyIds: [],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },
    {
      id:                   'winter-footwear',
      name:                 'Зимняя спецобувь',
      parentCategory:       'footwear',
      directions:           ['footwear'],                // footwear ∉ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'construction', 'mining'],
      relatedMaterialIds:   [],
      relatedTechnologyIds: [],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },
    {
      id:                   'summer-footwear',
      name:                 'Летняя спецобувь',
      parentCategory:       'footwear',
      directions:           ['footwear'],                // footwear ∉ CORE_DIRS
      targetIndustryIds:    ['construction', 'chemicals'],
      relatedMaterialIds:   [],
      relatedTechnologyIds: [],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           false,
    },

    // ── ppe ─────────────────────────────────────────────────────────────────────

    {
      id:                   'basic-ppe',
      name:                 'Базовые СИЗ',
      parentCategory:       'ppe',
      directions:           ['ppe'],                     // ppe ∈ CORE_DIRS
      targetIndustryIds:    ['oil-gas', 'metallurgy', 'construction', 'energy', 'chemicals'],
      relatedMaterialIds:   [],
      relatedTechnologyIds: [],
      keyGosts:             [],
      certificationStatus:  'unknown',
      isCoreLine:           true,
    },
  ],

  // ── industries ───────────────────────────────────────────────────────────────
  // ✓ Источник: AVANGARD.customerIndustries из lib/company.ts (7 отраслей)
  // ✓ isCore: из CORE_DIRS в lib/competitorIntelHelpers.ts
  // ✓ direction: маппинг name → AvangardDirection (где однозначно)

  industries: [
    {
      id:        'oil-gas',
      name:      'Нефтегаз',
      direction: 'oil-gas',
      isCore:    true,          // oil-gas ∈ CORE_DIRS
      keyClients: [],           // ○ KB-3: ['Газпром', 'Роснефть', 'ЛУКОЙЛ', ...]
      // ○ KB-3: revenueShare, strategicPriority
    },
    {
      id:        'metallurgy',
      name:      'Металлургия',
      direction: 'metallurgy',
      isCore:    true,          // metallurgy ∈ CORE_DIRS
      keyClients: [],           // ○ KB-3: ['Северсталь', 'НЛМК', ...]
    },
    {
      id:        'construction',
      name:      'Строительство и дорожное строительство',
      direction: 'construction',
      isCore:    false,         // construction ∉ CORE_DIRS
      keyClients: [],
    },
    {
      id:        'energy',
      name:      'Электроэнергетика',
      direction: 'energy',
      isCore:    false,
      keyClients: [],
    },
    {
      id:        'chemicals',
      name:      'Химическая промышленность',
      direction: 'chemicals',
      isCore:    false,
      keyClients: [],
    },
    {
      id:        'mining',
      name:      'Горнодобывающая промышленность',
      direction: undefined,     // нет соответствующего AvangardDirection
      isCore:    false,
      keyClients: [],
      // ○ KB-1: определить, есть ли у Авангарда продукты для горнодобычи
    },
    {
      id:        'food',
      name:      'Пищевая промышленность',
      direction: undefined,     // нет соответствующего AvangardDirection
      isCore:    false,
      keyClients: [],
      // ○ KB-1: определить актуальность — отрасль упомянута в company.ts,
      //          но не представлена ни в одном компоненте системы
    },
  ],

  // ── competitors ──────────────────────────────────────────────────────────────
  // ✓ names: из AVANGARD.competitors в lib/company.ts (5 имён)
  // ✓ domains: объединены из трёх источников:
  //   - COMPETITOR_DOMAINS в app/api/analyze/route.ts
  //   - DOMAIN_MAP в app/components/CompetitorWatch.tsx
  //   - domain map в lib/competitorIntelHelpers.ts
  // Урсус и Союзспецодежда присутствуют в коде, но не в company.ts — включены.
  // Энергоконтракт только в company.ts — домен неизвестен.

  competitors: [
    {
      id:                  'technoavia',
      name:                'Техноавиа',
      domains:             ['technoavia.ru'],
      hostnamePatterns:    ['technoavia'],
      productSpecializations: [], // ○ KB-2
      strongIndustries:    [],    // ○ KB-2
    },
    {
      id:                  'vostok-service',
      name:                'Восток-Сервис',
      domains:             ['vostok-service.ru'],
      hostnamePatterns:    ['vostok-service'],
      productSpecializations: [],
      strongIndustries:    [],
    },
    {
      id:                  'trakt',
      name:                'Тракт',
      domains:             ['trakt.ru'],
      hostnamePatterns:    ['trakt'],
      productSpecializations: [],
      strongIndustries:    [],
    },
    {
      id:                  'fakel-profi',
      name:                'Факел-Профи',
      // ✓ домен — из CompetitorWatch.tsx ('fakel.ru')
      // ○ KB-2: уточнить — fakel.ru или другой домен?
      domains:             ['fakel.ru'],
      hostnamePatterns:    ['fakel'],
      productSpecializations: [],
      strongIndustries:    [],
    },
    {
      id:                  'energokontract',
      name:                'Энергоконтракт',
      // ○ KB-2: домен неизвестен — найти и добавить
      domains:             [],
      hostnamePatterns:    [],
      productSpecializations: [],
      strongIndustries:    [],
    },
    {
      id:                  'ursus',
      name:                'Урсус',
      // ✓ присутствует в COMPETITOR_DOMAINS и domain-map, но не в company.ts
      domains:             ['ursus.ru'],
      hostnamePatterns:    ['ursus'],
      productSpecializations: [],
      strongIndustries:    [],
    },
    {
      id:                  'soyuzspecodezhda',
      name:                'Союзспецодежда',
      // ✓ присутствует в COMPETITOR_DOMAINS и domain-map, но не в company.ts
      // Примечание: в CompetitorWatch используется 'СОЮЗСПЕЦОДЕЖДА' (caps)
      domains:             ['soyuzspecodezhda.ru'],
      hostnamePatterns:    ['soyuzspecodezhda'],
      productSpecializations: [],
      strongIndustries:    [],
    },
  ],

  // ── strategy ─────────────────────────────────────────────────────────────────
  // ○ KB-3: заполнить после согласования с руководством

  strategy: {
    defensePriorities: [], // ○ KB-3: что защищаем (отрасли, доли, продукты)
    growthTargets:     [], // ○ KB-3: куда идём (новые сегменты, продукты)
    // ○ KB-3: currentFocus, horizon
  },

  // ── tenders ──────────────────────────────────────────────────────────────────
  // ○ KB-3: заполнить — критично для фильтрации нерелевантных тендеров

  tenders: {
    preferredCustomerTypes: [], // ○ KB-3
    preferredIndustryIds:   [], // ○ KB-3
    qualifications:         [], // ○ KB-3: российское производство, ГОСТ-сертификаты и т.д.
    activeRegistries:       [], // ○ KB-3: ГИСП, РТС-Тендер, B2B-Center?
    // ○ KB-3: minNMC, maxNMC
  },

  // ── certifications ───────────────────────────────────────────────────────────
  // ○ KB-1: КРИТИЧНО — без этих данных Gemini не может корректно оценивать
  //          регуляторные угрозы (нужна ли пересертификация или нет)
  // НЕ придумывать ГОСТы — вносить только подтверждённые сертификаты

  certifications: [],

  // ── technologies ─────────────────────────────────────────────────────────────
  // ✓ Источник: AVANGARD.priorityTechnologies из lib/company.ts (5 технологий)
  // ○ KB-1: заполнить productIds, description, competitiveEdge

  technologies: [
    {
      id:         'membranes',
      name:       'Мембранные технологии защиты',
      productIds: [], // ○ KB-1: ['workwear']
    },
    {
      id:         'flame-antistatic',
      name:       'Огнестойкая и антистатическая обработка',
      productIds: [],
    },
    {
      id:         'moisture-wicking',
      name:       'Влагоотведение и паропроницаемость',
      productIds: [],
    },
    {
      id:         'ergonomic-cut',
      name:       'Эргономичный крой и антропометрия',
      productIds: [],
    },
    {
      id:         'hi-vis-finish',
      name:       'Световозвращающая отделка',
      productIds: [],
    },
  ],

  // ── materials ─────────────────────────────────────────────────────────────────
  // ✓ Источник: AVANGARD.priorityMaterials из lib/company.ts (6 материалов)
  // ○ KB-1: заполнить suppliers, source, productIds, criticalityLevel
  //          Особенно важно source — для оценки импортозамещения

  materials: [
    {
      id:          'membrane-fabrics',
      name:        'Мембранные ткани (Gore-Tex и аналоги)',
      suppliers:   [], // ○ KB-1
      productIds:  [],
      // ○ KB-2: source — импорт или отечественные аналоги?
    },
    {
      id:          'flame-resistant-fabrics',
      name:        'Огнестойкие ткани (Nomex, арамид, Kermel)',
      suppliers:   [],
      productIds:  [],
    },
    {
      id:          'antistatic-materials',
      name:        'Антистатические материалы',
      suppliers:   [],
      productIds:  [],
    },
    {
      id:          'aramid-fibers',
      name:        'Арамидные волокна высокой прочности',
      suppliers:   [],
      productIds:  [],
    },
    {
      id:          'reflective-materials',
      name:        'Световозвращающие и сигнальные материалы',
      suppliers:   [],
      productIds:  [],
    },
    {
      id:          'high-strength-synthetics',
      name:        'Высокопрочные синтетические ткани',
      suppliers:   [],
      productIds:  [],
    },
  ],
};

// ── Convenience re-exports ────────────────────────────────────────────────────

/** Все ID конкурентов и их домены — для использования вместо разрозненных maps */
export const COMPETITOR_DOMAIN_MAP: Map<string, string> = new Map(
  COMPANY_KNOWLEDGE.competitors.flatMap(c =>
    c.domains.map(d => [d, c.name] as [string, string])
  )
);

/** Паттерны hostname → имя конкурента, для preclassifySource */
export const COMPETITOR_HOSTNAME_PATTERNS: Array<[string, string]> =
  COMPANY_KNOWLEDGE.competitors
    .filter(c => c.hostnamePatterns.length > 0)
    .flatMap(c => c.hostnamePatterns.map(p => [p, c.name] as [string, string]));

// ── Helper functions ───────────────────────────────────────────────────────────

/**
 * Найти конкурента по точному hostname (без www).
 * findCompetitorByDomain('technoavia.ru') → { name: 'Техноавиа', ... }
 */
export function findCompetitorByDomain(domain: string): CompetitorProfile | undefined {
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return COMPANY_KNOWLEDGE.competitors.find(c =>
    c.domains.some(d => d.toLowerCase() === normalized)
  );
}

/**
 * Найти конкурента по паттерну hostname (hostname.includes(pattern)).
 * Заменяет for-loop в preclassifySource().
 * findCompetitorByHostnamePattern('www.technoavia.ru') → { name: 'Техноавиа', ... }
 */
export function findCompetitorByHostnamePattern(hostname: string): CompetitorProfile | undefined {
  const lower = hostname.toLowerCase();
  return COMPANY_KNOWLEDGE.competitors.find(c =>
    c.hostnamePatterns.some(p => lower.includes(p))
  );
}

/**
 * Нормализовать любой вариант имени конкурента к каноническому.
 * Обрабатывает устаревшие варианты из localStorage:
 *   'СОЮЗСПЕЦОДЕЖДА' → 'Союзспецодежда'  (регистр)
 *   'Факел'          → 'Факел-Профи'     (неполное имя)
 */
export function normalizeCompetitorName(input: string): string {
  if (!input || input === 'null') return input;
  const lower = input.toLowerCase().trim();
  const found = COMPANY_KNOWLEDGE.competitors.find(c =>
    c.name.toLowerCase() === lower ||
    (c.id === 'fakel-profi' && lower === 'факел')
  );
  return found?.name ?? input;
}

/** Все домены конкурентов как Map<hostname, canonicalName> — заменяет разрозненные DOMAIN_MAP. */
export function getCompetitorDomains(): Map<string, string> {
  return COMPETITOR_DOMAIN_MAP;
}

/** Канонические имена всех конкурентов. */
export function getCompetitorNames(): string[] {
  return COMPANY_KNOWLEDGE.competitors.map(c => c.name);
}

// ── Product helpers ────────────────────────────────────────────────────────────

/**
 * Все линейки, связанные с направлением (по directions[]).
 * findProductsByDirection('flame-resistant') → [Огнестойкая спецодежда, ...]
 */
export function findProductsByDirection(direction: AvangardDirection): ProductLine[] {
  return COMPANY_KNOWLEDGE.productLines.filter(p => p.directions.includes(direction));
}

/**
 * Полнотекстовый поиск по name (регистронезависимый).
 * findProductsByKeyword('зимн') → [Зимняя спецодежда, Зимняя спецобувь]
 */
export function findProductsByKeyword(text: string): ProductLine[] {
  const lower = text.toLowerCase();
  return COMPANY_KNOWLEDGE.productLines.filter(p =>
    p.name.toLowerCase().includes(lower)
  );
}

/**
 * Только основные линейки (isCoreLine === true).
 * Используется в ThreatScore и CompetitiveIntelHub.
 */
export function getCoreProductLines(): ProductLine[] {
  return COMPANY_KNOWLEDGE.productLines.filter(p => p.isCoreLine);
}

/**
 * Найти линейки по ГОСТу.
 * KB-1: всегда возвращает [] (keyGosts пустые — безопасный дефолт).
 * Будет работать когда keyGosts заполнят подтверждёнными данными.
 */
export function mapGostToProducts(gost: string): ProductLine[] {
  return COMPANY_KNOWLEDGE.productLines.filter(p => p.keyGosts.includes(gost));
}
