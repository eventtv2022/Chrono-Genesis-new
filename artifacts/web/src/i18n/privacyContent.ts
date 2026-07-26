export interface PolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export const privacyContentRu: PolicySection[] = [
  {
    id: "general",
    title: "1. Общие положения",
    paragraphs: [
      "Настоящая Политика конфиденциальности и обработки персональных данных (далее — «Политика») описывает, как TimeNation (далее — «мы», «нас», «наш») собирает, использует, хранит и защищает информацию, полученную от пользователей веб-сайта timenation.info и мобильного приложения TimeNation (далее совместно — «Платформа»).",
      "TimeNation — это цифровое государство, основанное на концепции ценности человеческого времени. Мы уважаем вашу конфиденциальность и стремимся обеспечить максимальную прозрачность в вопросах обработки персональных данных.",
      "Используя Платформу, вы соглашаетесь с условиями настоящей Политики. Если вы не согласны с какими-либо её положениями, пожалуйста, прекратите использование Платформы.",
      "Настоящая Политика составлена в соответствии с Общим регламентом о защите данных (GDPR) Европейского союза, Федеральным законом Российской Федерации № 152-ФЗ «О персональных данных», а также иными применимыми законодательными актами в области защиты персональных данных.",
    ],
  },
  {
    id: "controller",
    title: "2. Оператор данных",
    paragraphs: [
      "Оператором персональных данных является: TimeNation (цифровое государство).",
      "Электронная почта для обращений по вопросам конфиденциальности: privacy@timenation.info",
      "Мессенджер Telegram: @timenation_support",
      "По всем вопросам, связанным с обработкой ваших персональных данных, вы можете обратиться к нам по указанным контактам. Мы обязуемся ответить на ваш запрос в течение 30 дней с момента его получения.",
    ],
  },
  {
    id: "data",
    title: "3. Какие данные мы собираем",
    paragraphs: [
      "При регистрации и использовании Платформы мы можем собирать следующие категории данных:",
      "Идентификационные данные: имя (никнейм), адрес электронной почты, фотография профиля (по желанию), дата рождения (при наличии).",
      "Контактные данные: номер телефона, адрес WhatsApp, предпочтительные каналы коммуникации (электронная почта, SMS, Telegram, WhatsApp, звонок).",
      "Финансовые данные: история транзакций в Дарминах (внутренняя валюта TimeNation), данные о налоговых отчислениях. Данные банковских карт обрабатываются исключительно оператором платёжных систем (Stripe) и не хранятся на наших серверах.",
      "Данные об использовании: IP-адрес, тип браузера и устройства, страницы, которые вы посещаете, время и продолжительность визитов, действия в приложении.",
      "Данные контента: видеозаписи, загружаемые в систему трансляций TimeNation TV, публичные сообщения и комментарии.",
      "Криптографические данные: публичные ключи для шифрования личных сообщений (приватные ключи генерируются исключительно на вашем устройстве и никогда не передаются нам).",
    ],
  },
  {
    id: "purposes",
    title: "4. Цели обработки",
    paragraphs: [
      "Мы обрабатываем ваши данные в следующих целях:",
      "Предоставление услуг: регистрация и управление вашим гражданством в TimeNation, обеспечение доступа к функциям Платформы, проведение транзакций в Дарминах, управление резервациями в TimeNation TV.",
      "Коммуникация: отправка уведомлений о событиях Платформы, новостей TimeNation, ответов на ваши запросы, служебных сообщений через предпочтительные вами каналы.",
      "Безопасность: защита от мошенничества, несанкционированного доступа, обнаружение подозрительной активности.",
      "Улучшение сервиса: анализ использования Платформы для оптимизации функциональности и интерфейса.",
      "Соблюдение законодательства: выполнение обязательств, предусмотренных применимым законодательством.",
    ],
  },
  {
    id: "legal",
    title: "5. Правовое основание",
    paragraphs: [
      "Мы обрабатываем ваши данные на следующих правовых основаниях (ст. 6 GDPR):",
      "Исполнение договора (ст. 6(1)(b) GDPR): обработка необходима для предоставления услуг, которые вы запросили, — в том числе для регистрации, ведения вашего аккаунта и транзакций.",
      "Законный интерес (ст. 6(1)(f) GDPR): обработка необходима для обеспечения безопасности Платформы, предотвращения мошенничества и улучшения качества сервиса.",
      "Согласие (ст. 6(1)(a) GDPR): для отдельных видов обработки (например, маркетинговые сообщения, аналитические cookie) мы запрашиваем ваше согласие. Вы вправе отозвать согласие в любое время без ущерба для законности обработки, осуществлённой до его отзыва.",
      "Соблюдение правовых обязательств (ст. 6(1)(c) GDPR): обработка необходима для выполнения требований применимого законодательства.",
    ],
  },
  {
    id: "retention",
    title: "6. Сроки хранения",
    paragraphs: [
      "Мы храним ваши данные не дольше, чем это необходимо для достижения целей, указанных в настоящей Политике.",
      "Данные аккаунта: хранятся в течение всего периода активности аккаунта плюс 90 дней после его закрытия (для обработки возможных претензий).",
      "Данные транзакций: хранятся в течение 5 лет в соответствии с требованиями налогового и бухгалтерского законодательства.",
      "Журналы безопасности: хранятся не более 12 месяцев.",
      "Данные cookie и аналитики: хранятся в соответствии с настройками браузера пользователя и не более 13 месяцев.",
      "После истечения срока хранения данные безвозвратно удаляются или обезличиваются.",
    ],
  },
  {
    id: "sharing",
    title: "7. Передача данных третьим лицам",
    paragraphs: [
      "Мы не продаём ваши персональные данные третьим лицам. Мы можем передавать данные следующим категориям получателей:",
      "Платёжные операторы: Stripe Inc. для обработки платежей. Stripe обрабатывает данные в соответствии со своей политикой конфиденциальности (stripe.com/privacy) и сертифицирован по стандарту PCI DSS.",
      "Облачные сервисы: хостинг-провайдеры, обеспечивающие техническую инфраструктуру Платформы. Передача осуществляется на основании соглашений об обработке данных (DPA).",
      "Мессенджеры и коммуникационные платформы: Telegram (для уведомлений и чатов), Twilio (для SMS и звонков) — в объёме, необходимом для доставки сообщений.",
      "Государственные органы: в случаях, предусмотренных применимым законодательством, по обоснованному требованию уполномоченных органов.",
      "При передаче данных в страны за пределами ЕЭЗ мы обеспечиваем надлежащие гарантии защиты в соответствии с требованиями GDPR (стандартные договорные клаузулы, решения об адекватности).",
    ],
  },
  {
    id: "rights",
    title: "8. Ваши права",
    paragraphs: [
      "В соответствии с GDPR вы обладаете следующими правами в отношении ваших персональных данных:",
      "Право на доступ (ст. 15): вы вправе запросить подтверждение обработки ваших данных и получить их копию.",
      "Право на исправление (ст. 16): вы вправе требовать исправления неточных данных.",
      "Право на удаление (ст. 17, «право быть забытым»): вы вправе запросить удаление ваших данных при наличии оснований, предусмотренных законодательством.",
      "Право на ограничение обработки (ст. 18): вы вправе требовать ограничения обработки при оспаривании точности данных или при возражении против их обработки.",
      "Право на переносимость данных (ст. 20): вы вправе получить ваши данные в структурированном, машиночитаемом формате.",
      "Право на возражение (ст. 21): вы вправе возражать против обработки данных на основании законного интереса.",
      "Право на отзыв согласия: если обработка основана на вашем согласии, вы можете отозвать его в любое время.",
      "Для реализации прав направьте запрос на privacy@timenation.info. Срок ответа — 30 дней. Вы также вправе подать жалобу в надзорный орган по защите данных.",
    ],
  },
  {
    id: "security",
    title: "9. Безопасность данных",
    paragraphs: [
      "Мы применяем технические и организационные меры для защиты ваших данных от несанкционированного доступа, изменения, раскрытия или уничтожения.",
      "Используемые меры безопасности включают: шифрование данных при передаче (TLS/HTTPS), хэширование паролей с использованием современных алгоритмов (bcrypt), сквозное шифрование личных сообщений (NaCl/TweetNaCl), ограничение доступа к данным по принципу наименьших привилегий, регулярный аудит безопасности.",
      "В случае обнаружения утечки данных, затрагивающей ваши права и свободы, мы уведомим вас и соответствующий надзорный орган в сроки, установленные законодательством (не позднее 72 часов с момента обнаружения).",
    ],
  },
  {
    id: "cookies",
    title: "10. Файлы cookie",
    paragraphs: [
      "Мы используем файлы cookie и аналогичные технологии (localStorage, sessionStorage) для обеспечения работы Платформы.",
      "Необходимые cookie: обязательны для функционирования сайта (сессия пользователя, языковые настройки). Не могут быть отключены.",
      "Аналитические cookie: помогают нам понять, как пользователи взаимодействуют с Платформой. Используются только с вашего согласия.",
      "Маркетинговые cookie: используются для персонализации рекламы. Используются только с вашего согласия.",
      "Вы можете управлять настройками cookie через баннер на нашем сайте или настройки вашего браузера. Отключение необходимых cookie может повлиять на функциональность Платформы.",
    ],
  },
  {
    id: "contact",
    title: "11. Контакты и обновления",
    paragraphs: [
      "По всем вопросам, связанным с конфиденциальностью и обработкой данных, обращайтесь: privacy@timenation.info",
      "Мы оставляем за собой право вносить изменения в настоящую Политику. При существенных изменениях мы уведомим вас через Платформу не менее чем за 30 дней до их вступления в силу.",
      "Актуальная версия Политики всегда доступна на timenation.info/privacy.",
      "Дата последнего обновления: 26 июля 2026 г.",
    ],
  },
];

export const privacyContentEn: PolicySection[] = [
  {
    id: "general",
    title: "1. General Provisions",
    paragraphs: [
      "This Privacy Policy and Personal Data Processing Policy (the \"Policy\") describes how TimeNation (\"we\", \"us\", \"our\") collects, uses, stores, and protects information received from users of the timenation.info website and the TimeNation mobile application (collectively, the \"Platform\").",
      "TimeNation is a digital state founded on the concept of the value of human time. We respect your privacy and aim to ensure maximum transparency in the processing of personal data.",
      "By using the Platform, you agree to the terms of this Policy. If you disagree with any of its provisions, please stop using the Platform.",
      "This Policy is drafted in accordance with the General Data Protection Regulation (GDPR) of the European Union, the Russian Federal Law No. 152-FZ \"On Personal Data\", and other applicable legislation in the field of personal data protection.",
    ],
  },
  {
    id: "controller",
    title: "2. Data Controller",
    paragraphs: [
      "The personal data controller is: TimeNation (digital state).",
      "Email for privacy inquiries: privacy@timenation.info",
      "Telegram messenger: @timenation_support",
      "For any questions regarding the processing of your personal data, you may contact us via the details above. We undertake to respond to your request within 30 days of receipt.",
    ],
  },
  {
    id: "data",
    title: "3. Data We Collect",
    paragraphs: [
      "When registering and using the Platform, we may collect the following categories of data:",
      "Identification data: name (nickname), email address, profile photo (optional), date of birth (if provided).",
      "Contact data: phone number, WhatsApp address, preferred communication channels (email, SMS, Telegram, WhatsApp, phone call).",
      "Financial data: transaction history in Darmins (TimeNation's internal currency), tax contribution records. Payment card data is processed exclusively by the payment processor (Stripe) and is not stored on our servers.",
      "Usage data: IP address, browser and device type, pages visited, time and duration of visits, in-app actions.",
      "Content data: videos uploaded to the TimeNation TV broadcast system, public messages and comments.",
      "Cryptographic data: public keys for encrypting direct messages (private keys are generated exclusively on your device and are never transmitted to us).",
    ],
  },
  {
    id: "purposes",
    title: "4. Purposes of Processing",
    paragraphs: [
      "We process your data for the following purposes:",
      "Service delivery: registration and management of your TimeNation citizenship, providing access to Platform features, processing Darmin transactions, managing TimeNation TV reservations.",
      "Communication: sending notifications about Platform events, TimeNation news, responses to your inquiries, and service messages via your preferred channels.",
      "Security: protection against fraud, unauthorized access, detection of suspicious activity.",
      "Service improvement: analysis of Platform usage to optimize functionality and interface.",
      "Legal compliance: fulfillment of obligations under applicable legislation.",
    ],
  },
  {
    id: "legal",
    title: "5. Legal Basis",
    paragraphs: [
      "We process your data on the following legal grounds (Art. 6 GDPR):",
      "Performance of a contract (Art. 6(1)(b) GDPR): processing is necessary to provide the services you have requested, including registration, account management, and transactions.",
      "Legitimate interests (Art. 6(1)(f) GDPR): processing is necessary to ensure Platform security, prevent fraud, and improve service quality.",
      "Consent (Art. 6(1)(a) GDPR): for certain types of processing (e.g., marketing communications, analytics cookies), we request your consent. You may withdraw consent at any time without affecting the lawfulness of processing carried out before withdrawal.",
      "Legal obligation (Art. 6(1)(c) GDPR): processing is necessary to comply with applicable legislation.",
    ],
  },
  {
    id: "retention",
    title: "6. Retention Periods",
    paragraphs: [
      "We retain your data no longer than necessary to achieve the purposes set out in this Policy.",
      "Account data: retained for the entire period of account activity plus 90 days after closure (to handle possible claims).",
      "Transaction data: retained for 5 years in accordance with tax and accounting legislation.",
      "Security logs: retained for no more than 12 months.",
      "Cookie and analytics data: retained in accordance with user browser settings and for no more than 13 months.",
      "After the retention period expires, data is irreversibly deleted or anonymized.",
    ],
  },
  {
    id: "sharing",
    title: "7. Sharing with Third Parties",
    paragraphs: [
      "We do not sell your personal data to third parties. We may share data with the following categories of recipients:",
      "Payment processors: Stripe Inc. for payment processing. Stripe processes data in accordance with its privacy policy (stripe.com/privacy) and is PCI DSS certified.",
      "Cloud services: hosting providers supporting the Platform's technical infrastructure. Transfers are made under data processing agreements (DPAs).",
      "Messaging and communication platforms: Telegram (for notifications and chats), Twilio (for SMS and calls) — to the extent necessary for message delivery.",
      "Government authorities: in cases provided for by applicable legislation, upon justified request from authorized bodies.",
      "When transferring data outside the EEA, we ensure appropriate safeguards in accordance with GDPR requirements (standard contractual clauses, adequacy decisions).",
    ],
  },
  {
    id: "rights",
    title: "8. Your Rights",
    paragraphs: [
      "Under GDPR, you have the following rights regarding your personal data:",
      "Right of access (Art. 15): you may request confirmation of the processing of your data and obtain a copy.",
      "Right to rectification (Art. 16): you may request correction of inaccurate data.",
      "Right to erasure (Art. 17, \"right to be forgotten\"): you may request deletion of your data where grounds under applicable law exist.",
      "Right to restriction of processing (Art. 18): you may request restriction of processing when disputing data accuracy or objecting to processing.",
      "Right to data portability (Art. 20): you may receive your data in a structured, machine-readable format.",
      "Right to object (Art. 21): you may object to processing based on legitimate interests.",
      "Right to withdraw consent: if processing is based on your consent, you may withdraw it at any time.",
      "To exercise your rights, send a request to privacy@timenation.info. Response time — 30 days. You also have the right to lodge a complaint with a data protection supervisory authority.",
    ],
  },
  {
    id: "security",
    title: "9. Data Security",
    paragraphs: [
      "We apply technical and organizational measures to protect your data from unauthorized access, alteration, disclosure, or destruction.",
      "Security measures in use include: encryption of data in transit (TLS/HTTPS), password hashing using modern algorithms (bcrypt), end-to-end encryption of direct messages (NaCl/TweetNaCl), data access restriction by least-privilege principle, regular security audits.",
      "In the event of a data breach affecting your rights and freedoms, we will notify you and the relevant supervisory authority within the timeframes established by law (no later than 72 hours from discovery).",
    ],
  },
  {
    id: "cookies",
    title: "10. Cookies",
    paragraphs: [
      "We use cookies and similar technologies (localStorage, sessionStorage) to operate the Platform.",
      "Necessary cookies: required for the website to function (user session, language settings). Cannot be disabled.",
      "Analytics cookies: help us understand how users interact with the Platform. Used only with your consent.",
      "Marketing cookies: used to personalize advertising. Used only with your consent.",
      "You can manage cookie settings via the banner on our website or your browser settings. Disabling necessary cookies may affect Platform functionality.",
    ],
  },
  {
    id: "contact",
    title: "11. Contact & Updates",
    paragraphs: [
      "For all questions related to privacy and data processing, contact us: privacy@timenation.info",
      "We reserve the right to amend this Policy. For material changes, we will notify you through the Platform no less than 30 days before they take effect.",
      "The current version of the Policy is always available at timenation.info/privacy.",
      "Date of last update: July 26, 2026.",
    ],
  },
];
