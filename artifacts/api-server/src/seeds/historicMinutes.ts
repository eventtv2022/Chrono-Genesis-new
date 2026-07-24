/**
 * TimeNation — Государственный Хроно-Реестр (State Heritage Registry)
 * 1,000 protected historic minutes seeded into state_historic_minutes.
 *
 * Composition:
 *   • ~120 curated world-historical events (SPACE, TECH, SCIENCE, WORLD_HISTORY, CULTURE_ARTS, SPORTS)
 *   •  30 century-end boundary minutes  (Dec 31 23:59, years 100–3000)
 *   • remaining slots filled with year-start minutes (Jan 1 00:00, years 1-N) to total 1,000 unique entries
 */

export interface HistoricMinuteSeed {
  coord: string; // 12-digit YYYYMMDDHHmm
  category: string;
  title: string;
  description: string;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function pad4(n: number) { return String(n).padStart(4, "0"); }
function coord(y: number, mo: number, d: number, h: number, mi: number): string {
  return `${pad4(y)}${pad2(mo)}${pad2(d)}${pad2(h)}${pad2(mi)}`;
}
function iso(s: string): string {
  const dt = new Date(s);
  return coord(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes());
}

// ─── CURATED EVENTS ────────────────────────────────────────────────────────────
const CURATED: HistoricMinuteSeed[] = [
  // SPACE
  { coord: iso("1957-10-04T19:28:00Z"), category:"SPACE", title:"Запуск Спутника-1", description:"Начало космической эры человечества." },
  { coord: iso("1961-04-12T06:07:00Z"), category:"SPACE", title:"Старт Восток-1 (Гагарин)", description:"Первый человек отправляется в космос." },
  { coord: iso("1965-03-18T08:30:00Z"), category:"SPACE", title:"Первый выход в открытый космос (Леонов)", description:"Алексей Леонов — первый человек в открытом космосе." },
  { coord: iso("1969-07-20T20:17:00Z"), category:"SPACE", title:"Посадка Аполлона-11 на Луну", description:"Eagle has landed." },
  { coord: iso("1969-07-21T02:56:00Z"), category:"SPACE", title:"Первый шаг на Луне (Армстронг)", description:"Один маленький шаг для человека." },
  { coord: iso("1972-12-07T05:33:00Z"), category:"SPACE", title:"Запуск Аполлон-17", description:"Последняя пилотируемая лунная миссия." },
  { coord: iso("1977-09-05T12:56:00Z"), category:"SPACE", title:"Запуск Вояджер-1", description:"Самый дальний рукотворный объект." },
  { coord: iso("1990-04-24T12:33:00Z"), category:"SPACE", title:"Запуск телескопа Хаббл", description:"Открытие глубокого космоса." },
  { coord: iso("1998-11-20T06:40:00Z"), category:"SPACE", title:"Запуск первого модуля МКС (Заря)", description:"Начало непрерывного пребывания на орбите." },
  { coord: iso("2012-08-06T05:17:00Z"), category:"SPACE", title:"Посадка Curiosity на Марс", description:"Семь минут страха." },
  { coord: iso("2020-05-30T19:22:00Z"), category:"SPACE", title:"Запуск Crew Dragon Demo-2 (SpaceX)", description:"Первая частная пилотируемая миссия." },
  { coord: iso("2021-12-25T12:20:00Z"), category:"SPACE", title:"Запуск телескопа JWST", description:"Наиболее мощный инфракрасный телескоп." },
  { coord: iso("1961-08-06T09:00:00Z"), category:"SPACE", title:"Полёт Титова (Восток-2)", description:"Второй советский космонавт, 25 часов на орбите." },
  { coord: iso("1968-12-24T21:36:00Z"), category:"SPACE", title:"Аполлон-8 огибает Луну", description:"Первый экипаж, покинувший орбиту Земли." },
  { coord: iso("1976-07-20T11:53:00Z"), category:"SPACE", title:"Посадка Викинг-1 на Марс", description:"Первая успешная посадка на Марс." },
  { coord: iso("1981-04-12T12:00:00Z"), category:"SPACE", title:"Первый полёт Space Shuttle Columbia", description:"Начало эры многоразовых кораблей." },
  { coord: iso("1986-02-20T21:28:00Z"), category:"SPACE", title:"Запуск станции Мир", description:"Советская орбитальная станция нового поколения." },
  { coord: iso("2004-01-04T04:35:00Z"), category:"SPACE", title:"Посадка Spirit (Марс)", description:"Марсоход начинает исследования равнины Гусева." },
  { coord: iso("2015-07-14T11:49:00Z"), category:"SPACE", title:"Аппарат New Horizons у Плутона", description:"Первый облёт Плутона." },
  { coord: iso("2021-04-19T07:34:00Z"), category:"SPACE", title:"Первый полёт вертолёта Ingenuity на Марсе", description:"Первый управляемый полёт на другой планете." },
  { coord: iso("2021-02-18T20:55:00Z"), category:"SPACE", title:"Посадка Perseverance на Марс", description:"Старт поиска следов древней жизни на Марсе." },
  { coord: iso("1966-02-03T09:45:00Z"), category:"SPACE", title:"Мягкая посадка Луна-9", description:"Первый аппарат, совершивший мягкую посадку на Луну." },
  { coord: iso("2019-04-10T13:07:00Z"), category:"SPACE", title:"Первая фотография чёрной дыры (M87)", description:"Event Horizon Telescope публикует исторический снимок." },
  { coord: iso("2023-07-14T11:57:00Z"), category:"SPACE", title:"Запуск Европейского телескопа Euclid", description:"Картографирование тёмной материи и энергии Вселенной." },

  // TECH_INNOVATION
  { coord: iso("1946-02-14T21:00:00Z"), category:"TECH_INNOVATION", title:"Анонс ENIAC", description:"Первый электронный цифровой компьютер общего назначения." },
  { coord: iso("1969-10-29T22:30:00Z"), category:"TECH_INNOVATION", title:"Первая передача ARPANET", description:"Отправка 'LO' — рождение Интернета." },
  { coord: iso("1971-11-15T09:00:00Z"), category:"TECH_INNOVATION", title:"Релиз Intel 4004", description:"Начало микрокомпьютерной эры." },
  { coord: iso("1976-04-01T13:00:00Z"), category:"TECH_INNOVATION", title:"Основание Apple", description:"Джобс и Возняк подписывают соглашение." },
  { coord: iso("1981-08-12T14:00:00Z"), category:"TECH_INNOVATION", title:"Выпуск IBM PC", description:"Персональный компьютер входит в массовый рынок." },
  { coord: iso("1984-01-24T17:00:00Z"), category:"TECH_INNOVATION", title:"Презентация Macintosh", description:"Графический интерфейс для масс." },
  { coord: iso("1985-11-20T09:00:00Z"), category:"TECH_INNOVATION", title:"Выпуск Windows 1.0", description:"Microsoft выпускает первую Windows." },
  { coord: iso("1990-12-20T14:00:00Z"), category:"TECH_INNOVATION", title:"Первый веб-сайт (Бернерс-Ли)", description:"World Wide Web в CERN." },
  { coord: iso("1991-08-25T22:57:00Z"), category:"TECH_INNOVATION", title:"Анонс ядра Linux", description:"Линус Торвальдс публикует первое объявление о Linux." },
  { coord: iso("1994-07-05T08:00:00Z"), category:"TECH_INNOVATION", title:"Основание Amazon", description:"Джефф Безос регистрирует интернет-магазин." },
  { coord: iso("1998-09-04T08:00:00Z"), category:"TECH_INNOVATION", title:"Регистрация Google", description:"Ларри Пейдж и Сергей Брин." },
  { coord: iso("2001-01-15T00:00:00Z"), category:"TECH_INNOVATION", title:"Запуск Wikipedia", description:"Начало величайшей открытой энциклопедии." },
  { coord: iso("2004-02-04T00:00:00Z"), category:"TECH_INNOVATION", title:"Запуск Facebook", description:"Марк Цукерберг запускает TheFacebook." },
  { coord: iso("2005-04-23T20:27:00Z"), category:"TECH_INNOVATION", title:"Первое видео на YouTube", description:"Видео Me at the zoo — начало эры видеохостингов." },
  { coord: iso("2007-01-09T17:42:00Z"), category:"TECH_INNOVATION", title:"Презентация первого iPhone", description:"Джобс представляет трёхкомпонентное устройство." },
  { coord: iso("2008-10-31T18:10:00Z"), category:"TECH_INNOVATION", title:"Whitepaper Bitcoin (Сатоши Накамото)", description:"Рождение блокчейн-технологий." },
  { coord: iso("2009-01-03T18:15:00Z"), category:"TECH_INNOVATION", title:"Genesis Block Биткоина", description:"Добыт первый блок с цитатой The Times." },
  { coord: iso("2015-07-30T23:00:00Z"), category:"TECH_INNOVATION", title:"Запуск Ethereum", description:"Платформа смарт-контрактов выходит в мейнет." },
  { coord: iso("2016-03-15T10:00:00Z"), category:"TECH_INNOVATION", title:"AlphaGo побеждает Ли Седоля (4:1)", description:"ИИ DeepMind побеждает чемпиона мира по Го." },
  { coord: iso("2022-11-30T18:00:00Z"), category:"TECH_INNOVATION", title:"Запуск ChatGPT (OpenAI)", description:"Начало эры массового генеративного ИИ." },
  { coord: iso("1947-12-16T00:00:00Z"), category:"TECH_INNOVATION", title:"Изобретение транзистора (Bell Labs)", description:"Основа всей современной электроники." },
  { coord: iso("1960-05-16T00:00:00Z"), category:"TECH_INNOVATION", title:"Первый лазер (Теодор Мейман)", description:"Новый тип когерентного излучения." },
  { coord: iso("2023-03-14T00:00:00Z"), category:"TECH_INNOVATION", title:"Выпуск GPT-4 (OpenAI)", description:"Мультимодальная языковая модель нового поколения." },

  // SCIENCE
  { coord: iso("1895-11-08T18:00:00Z"), category:"SCIENCE", title:"Открытие рентгеновских лучей (Рентген)", description:"Вильгельм Рентген открывает X-лучи." },
  { coord: iso("1898-07-26T00:00:00Z"), category:"SCIENCE", title:"Открытие радия (Мария Кюри)", description:"Мария и Пьер Кюри объявляют об открытии радия." },
  { coord: iso("1905-09-27T12:00:00Z"), category:"SCIENCE", title:"Публикация E=mc² (Эйнштейн)", description:"Эквивалентность массы и энергии." },
  { coord: iso("1928-09-28T08:00:00Z"), category:"SCIENCE", title:"Открытие пенициллина (Флеминг)", description:"Первый антибиотик в истории медицины." },
  { coord: iso("1953-02-28T12:00:00Z"), category:"SCIENCE", title:"Открытие структуры ДНК (Уотсон и Крик)", description:"Расшифровка двойной спирали жизни." },
  { coord: iso("1955-04-12T00:00:00Z"), category:"SCIENCE", title:"Вакцина от полиомиелита (Солк)", description:"Официальное подтверждение эффективности вакцины." },
  { coord: iso("1859-11-24T00:00:00Z"), category:"SCIENCE", title:"'Происхождение видов' (Дарвин)", description:"Публикация теории эволюции через естественный отбор." },
  { coord: iso("1869-03-06T00:00:00Z"), category:"SCIENCE", title:"Периодическая система (Менделеев)", description:"Менделеев представляет таблицу элементов." },
  { coord: iso("1900-12-14T00:00:00Z"), category:"SCIENCE", title:"Квантовая теория (Планк)", description:"Макс Планк вводит понятие кванта энергии." },
  { coord: iso("1905-06-30T00:00:00Z"), category:"SCIENCE", title:"Специальная теория относительности (Эйнштейн)", description:"Революция в понимании пространства и времени." },
  { coord: iso("1932-02-27T00:00:00Z"), category:"SCIENCE", title:"Открытие нейтрона (Чедвик)", description:"Дополнение модели атомного ядра." },
  { coord: iso("1938-12-17T00:00:00Z"), category:"SCIENCE", title:"Открытие ядерного деления (Ган и Штрасман)", description:"Начало ядерной эры." },
  { coord: iso("1967-11-28T00:00:00Z"), category:"SCIENCE", title:"Открытие пульсара (Белл и Хьюиш)", description:"Обнаружение быстровращающихся нейтронных звёзд." },
  { coord: iso("2003-04-14T00:00:00Z"), category:"SCIENCE", title:"Завершение проекта Геном человека", description:"Расшифровка полного генома Homo sapiens." },
  { coord: iso("2012-07-04T07:00:00Z"), category:"SCIENCE", title:"Открытие бозона Хиггса (CERN)", description:"Подтверждение Стандартной модели физики." },
  { coord: iso("2015-09-14T09:50:00Z"), category:"SCIENCE", title:"Детектирование гравитационных волн (LIGO)", description:"Экспериментальное подтверждение ОТО." },
  { coord: iso("2012-06-25T00:00:00Z"), category:"SCIENCE", title:"Метод редактирования генома CRISPR-Cas9", description:"Революция в генной инженерии." },
  { coord: iso("1921-07-27T00:00:00Z"), category:"SCIENCE", title:"Открытие инсулина (Бантинг и Бест)", description:"Лечение диабета становится реальностью." },
  { coord: iso("1796-05-14T00:00:00Z"), category:"SCIENCE", title:"Первая вакцинация (Дженнер)", description:"Эдвард Дженнер прививает оспу мальчику." },
  { coord: iso("2022-12-05T00:00:00Z"), category:"SCIENCE", title:"Первая термоядерная реакция с выделением энергии (NIF)", description:"Рубеж управляемого термоядерного синтеза достигнут." },

  // WORLD_HISTORY
  { coord: iso("1215-06-15T00:00:00Z"), category:"WORLD_HISTORY", title:"Подписание Великой хартии вольностей", description:"Magna Carta — основа конституционного права." },
  { coord: iso("1453-05-29T00:00:00Z"), category:"WORLD_HISTORY", title:"Падение Константинополя", description:"Конец Византийской империи." },
  { coord: iso("1492-10-12T00:00:00Z"), category:"WORLD_HISTORY", title:"Открытие Америки (Колумб)", description:"Высадка на острове Гуанахани." },
  { coord: iso("1776-07-04T00:00:00Z"), category:"WORLD_HISTORY", title:"Декларация независимости США", description:"Принятие документа на Континентальном конгрессе." },
  { coord: iso("1789-07-14T15:00:00Z"), category:"WORLD_HISTORY", title:"Взятие Бастилии", description:"Символ Великой Французской революции." },
  { coord: iso("1815-06-18T11:00:00Z"), category:"WORLD_HISTORY", title:"Битва при Ватерлоо", description:"Окончательное поражение Наполеона." },
  { coord: iso("1865-04-09T16:00:00Z"), category:"WORLD_HISTORY", title:"Капитуляция армии Конфедерации (Аппоматтокс)", description:"Окончание Гражданской войны в США." },
  { coord: iso("1905-06-27T00:00:00Z"), category:"WORLD_HISTORY", title:"Революция 1905 года в России — восстание на Потёмкине", description:"Начало первой русской революции." },
  { coord: iso("1914-07-28T00:00:00Z"), category:"WORLD_HISTORY", title:"Начало Первой мировой войны", description:"Австро-Венгрия объявляет войну Сербии." },
  { coord: iso("1917-11-07T22:40:00Z"), category:"WORLD_HISTORY", title:"Октябрьская революция в России", description:"Штурм Зимнего дворца." },
  { coord: iso("1939-09-01T04:45:00Z"), category:"WORLD_HISTORY", title:"Начало Второй мировой войны", description:"Германия вторгается в Польшу." },
  { coord: iso("1941-12-07T07:55:00Z"), category:"WORLD_HISTORY", title:"Нападение на Перл-Харбор", description:"Японская атака, США вступают в войну." },
  { coord: iso("1944-06-06T06:30:00Z"), category:"WORLD_HISTORY", title:"День Д (высадка в Нормандии)", description:"Крупнейшая морская десантная операция." },
  { coord: iso("1945-05-09T00:01:00Z"), category:"WORLD_HISTORY", title:"Акт о капитуляции Германии (День Победы)", description:"Окончание Второй мировой в Европе." },
  { coord: iso("1945-08-06T08:15:00Z"), category:"WORLD_HISTORY", title:"Атомная бомбардировка Хиросимы", description:"Первое боевое применение ядерного оружия." },
  { coord: iso("1945-10-24T00:00:00Z"), category:"WORLD_HISTORY", title:"Вступление в силу Устава ООН", description:"Создание Организации Объединённых Наций." },
  { coord: iso("1947-08-15T00:00:00Z"), category:"WORLD_HISTORY", title:"Независимость Индии", description:"Джавахарлал Неру провозглашает свободу Индии." },
  { coord: iso("1948-05-14T16:00:00Z"), category:"WORLD_HISTORY", title:"Провозглашение государства Израиль", description:"Давид Бен-Гурион объявляет о создании государства." },
  { coord: iso("1963-08-28T15:00:00Z"), category:"WORLD_HISTORY", title:"Речь Мартина Лютера Кинга 'У меня есть мечта'", description:"Марш на Вашингтон за гражданские права." },
  { coord: iso("1963-11-22T12:30:00Z"), category:"WORLD_HISTORY", title:"Убийство Кеннеди", description:"Покушение на президента США в Далласе." },
  { coord: iso("1989-11-09T18:57:00Z"), category:"WORLD_HISTORY", title:"Объявление об открытии Берлинской стены", description:"Пресс-конференция Гюнтера Шабовски." },
  { coord: iso("1991-12-25T16:32:00Z"), category:"WORLD_HISTORY", title:"Спуск флага СССР над Кремлём", description:"Завершение советского периода истории." },
  { coord: iso("1994-05-10T00:00:00Z"), category:"WORLD_HISTORY", title:"Инаугурация Нельсона Манделы", description:"Конец апартеида, первый чёрный президент ЮАР." },
  { coord: iso("2001-09-11T08:46:00Z"), category:"WORLD_HISTORY", title:"Теракты 11 сентября 2001 года", description:"Атака на башни ВТЦ. Мир изменился навсегда." },
  { coord: iso("2008-11-04T23:00:00Z"), category:"WORLD_HISTORY", title:"Победа Барака Обамы на выборах", description:"Первый афроамериканский президент США." },
  { coord: iso("2020-03-11T15:00:00Z"), category:"WORLD_HISTORY", title:"ВОЗ объявляет пандемию COVID-19", description:"Глобальный кризис общественного здравоохранения." },
  { coord: iso("1349-01-24T00:00:00Z"), category:"WORLD_HISTORY", title:"Пик эпидемии Чёрной смерти в Европе", description:"Бубонная чума уносит треть населения Европы." },
  { coord: iso("1517-10-31T00:00:00Z"), category:"WORLD_HISTORY", title:"95 тезисов Мартина Лютера", description:"Начало Реформации в Европе." },
  { coord: iso("1648-10-24T00:00:00Z"), category:"WORLD_HISTORY", title:"Вестфальский мир", description:"Окончание Тридцатилетней войны, основа системы национальных государств." },

  // CULTURE_ARTS
  { coord: iso("1440-02-23T00:00:00Z"), category:"CULTURE_ARTS", title:"Печатный пресс Гутенберга", description:"Революция в распространении знаний." },
  { coord: iso("1512-10-31T00:00:00Z"), category:"CULTURE_ARTS", title:"Открытие Сикстинской капеллы (Микеланджело)", description:"Папа Юлий II осматривает завершённую роспись." },
  { coord: iso("1824-05-07T19:00:00Z"), category:"CULTURE_ARTS", title:"Премьера 9-й симфонии Бетховена", description:"Глухой Бетховен дирижирует шедевром мировой музыки." },
  { coord: iso("1889-03-31T13:00:00Z"), category:"CULTURE_ARTS", title:"Открытие Эйфелевой башни", description:"Парижская Всемирная выставка 1889 года." },
  { coord: iso("1895-12-28T19:30:00Z"), category:"CULTURE_ARTS", title:"Первый киносеанс Братьев Люмьер", description:"Рождение мирового кинематографа в Париже." },
  { coord: iso("1906-12-24T21:00:00Z"), category:"CULTURE_ARTS", title:"Первая радиопередача (Фессенден)", description:"Рождество в радиоэфире — голос и музыка." },
  { coord: iso("1936-11-02T15:00:00Z"), category:"CULTURE_ARTS", title:"Первая телетрансляция BBC", description:"BBC открывает регулярное телевещание." },
  { coord: iso("1937-04-26T00:00:00Z"), category:"CULTURE_ARTS", title:"Создание Герники (Пикассо)", description:"Антивоенный шедевр, ответ на бомбардировку Герники." },
  { coord: iso("1969-08-15T17:00:00Z"), category:"CULTURE_ARTS", title:"Открытие Вудстока", description:"Кульминационный момент культуры 60-х." },
  { coord: iso("1973-10-20T00:00:00Z"), category:"CULTURE_ARTS", title:"Открытие Сиднейского оперного театра", description:"Архитектурный шедевр XX века." },
  { coord: iso("1985-07-13T12:00:00Z"), category:"CULTURE_ARTS", title:"Концерт Live Aid", description:"Самая масштабная музыкальная трансляция в истории." },
  { coord: iso("1997-06-26T00:00:00Z"), category:"CULTURE_ARTS", title:"Выход первой книги о Гарри Поттере", description:"Дж. К. Роулинг меняет мировую детскую литературу." },
  { coord: iso("1956-09-09T20:00:00Z"), category:"CULTURE_ARTS", title:"Дебют Элвиса Пресли на ТВ (Ed Sullivan Show)", description:"Начало эры рок-н-ролла на телевидении." },
  { coord: iso("1963-03-22T00:00:00Z"), category:"CULTURE_ARTS", title:"Первый альбом Beatles — Please Please Me", description:"Начало битломании." },

  // SPORTS
  { coord: iso("1896-04-06T14:00:00Z"), category:"SPORTS", title:"Открытие первых Олимпийских игр современности", description:"Афины, Греция — возрождение Олимпийских игр." },
  { coord: iso("1930-07-13T14:00:00Z"), category:"SPORTS", title:"Первый матч Чемпионата мира по футболу", description:"Уругвай, Монтевидео — рождение Кубка Мира." },
  { coord: iso("1954-05-06T18:00:00Z"), category:"SPORTS", title:"Роджер Баннистер — первый километр за 4 минуты", description:"Психологический и физический барьер сломан." },
  { coord: iso("1970-06-21T15:00:00Z"), category:"SPORTS", title:"Бразилия выигрывает третий Чемпионат мира", description:"Пеле и команда навсегда оставляют Кубок Жюля Риме себе." },
  { coord: iso("1980-07-19T11:00:00Z"), category:"SPORTS", title:"Открытие Олимпиады 1980 в Москве", description:"Старт XXII Летних Олимпийских игр." },
  { coord: iso("1996-07-19T20:01:00Z"), category:"SPORTS", title:"Открытие Олимпиады в Атланте 1996", description:"100-летие современных Олимпийских игр." },
  { coord: iso("2009-08-16T21:00:00Z"), category:"SPORTS", title:"Рекорд Усэйна Болта 9.58 (100 м)", description:"Мировой рекорд в спринте, Берлин." },
  { coord: iso("1936-08-09T00:00:00Z"), category:"SPORTS", title:"Джесси Оуэнс завоёвывает 4 золота в Берлине", description:"Триумф на Играх 1936 года." },
  { coord: iso("1976-07-18T00:00:00Z"), category:"SPORTS", title:"Надя Команечи — первая оценка 10,0 в гимнастике", description:"Совершенство на Монреальской Олимпиаде." },
  { coord: iso("1924-01-25T00:00:00Z"), category:"SPORTS", title:"Открытие первой Зимней Олимпиады (Шамони)", description:"Начало зимних Олимпийских игр." },
];

// ─── CENTURY-END BOUNDARY MINUTES ──────────────────────────────────────────────
// Dec 31, 23:59 for years 100, 200, ..., 3000
function genCenturyEnds(): HistoricMinuteSeed[] {
  const out: HistoricMinuteSeed[] = [];
  for (let century = 1; century <= 30; century++) {
    const year = century * 100;
    out.push({
      coord: coord(year, 12, 31, 23, 59),
      category: "CENTURY_BOUNDARY",
      title: `Последняя минута ${century}-го века (${year} год)`,
      description: `Граничная минута столетия — неотчуждаемая государственная собственность TimeNation.`,
    });
  }
  return out;
}

// ─── YEAR-START MINUTES ─────────────────────────────────────────────────────────
// Jan 1, 00:00 for years 1 through N (until total = 1000 unique entries)
function genYearStarts(needed: number): HistoricMinuteSeed[] {
  const out: HistoricMinuteSeed[] = [];
  for (let year = 1; year <= 9999 && out.length < needed; year++) {
    out.push({
      coord: coord(year, 1, 1, 0, 0),
      category: "YEAR_BOUNDARY",
      title: `Первая минута ${year} года`,
      description: `Начало ${year} года — государственный временной рубеж.`,
    });
  }
  return out;
}

// ─── BUILD FINAL SET OF 1,000 ─────────────────────────────────────────────────
export function buildHeritageRegistry(): HistoricMinuteSeed[] {
  const seen = new Set<string>();
  const result: HistoricMinuteSeed[] = [];

  function add(entry: HistoricMinuteSeed) {
    if (!seen.has(entry.coord)) {
      seen.add(entry.coord);
      result.push(entry);
    }
  }

  // 1. Curated events
  CURATED.forEach(add);

  // 2. Century-end boundaries
  genCenturyEnds().forEach(add);

  // 3. Year-start minutes to reach 1000
  const yearStarts = genYearStarts(1000 - result.length + 50); // +50 buffer for dedup
  yearStarts.forEach(add);

  return result.slice(0, 1000);
}
