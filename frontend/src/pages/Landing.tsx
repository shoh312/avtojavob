import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, AtSign, Bell, Bot, Check, ChevronDown, Clock, Globe2, KanbanSquare, Megaphone, MessageCircle,
  Plus, Send, ShieldCheck, ShoppingBag, Sparkles, UsersRound, Workflow, X, Zap,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { Logo } from '../components/Logo'
import { LangSwitch } from '../components/ui'

/* ================================================================== matnlar */

type Chat = { who: 'in' | 'out'; text: string }[]

const TX = {
  ru: {
    nav: ['Возможности', 'Как это работает', 'Тарифы', 'Вопросы'], login: 'Войти', start: 'Начать бесплатно', dash: 'Открыть панель',
    chip: 'Автоматизация Instagram + AI',
    h1a: 'Instagram', h1b: 'продаёт сам', h1c: '— пока вы спите',
    sub: 'ChatFlow отвечает на комментарии и сообщения в Direct за 2 секунды, называет цены, собирает телефоны и присылает заявки вам в Telegram.',
    cta: 'Попробовать 7 дней бесплатно', cta2: 'Как это работает',
    trust: ['Без банковской карты', 'Официальный API Meta', 'Запуск за 5 минут'],
    chat: [
      { who: 'in', text: 'Здравствуйте! Сколько стоит курс?' },
      { who: 'out', text: 'Здравствуйте! 😊 Какой курс вас интересует — английский или IT?' },
      { who: 'in', text: 'Английский' },
      { who: 'out', text: 'Английский — 450 сомони в месяц, 3 раза в неделю. Записать вас? Напишите имя и номер 📱' },
      { who: 'in', text: 'Мадина, +992 90 123 45 67' },
      { who: 'out', text: 'Спасибо, Мадина! Менеджер свяжется с вами сегодня ✅' },
    ] as Chat,
    comment: 'прокомментировала: цена? 😍', online: 'в сети', ai: 'AI-продавец', reply_in: 'Ответ за 2 сек',
    lead_t: 'Новая заявка', lead_d: 'Мадина · +992 90 123 45 67 · Английский',
    niches: ['Учебные центры', 'Магазины одежды', 'Салоны красоты', 'Клиники', 'Рестораны', 'Онлайн-школы', 'Блогеры', 'Туристические агентства', 'Автосервисы', 'Кондитерские'],
    pain_t: 'Каждый неотвеченный «цена?» — это клиент, который ушёл к конкуренту',
    without: 'Без ChatFlow', with: 'С ChatFlow',
    pain: ['Отвечаете через 3 часа — клиент уже купил у других', 'Ночью и в выходные Direct молчит', 'Одни и те же вопросы по 50 раз в день', 'Телефоны клиентов теряются в переписке'],
    gain: ['Ответ за 2 секунды — днём и ночью', 'AI-продавец работает 24/7 без выходных', 'Цены и каталог отправляются автоматически', 'Все заявки — в CRM и в вашем Telegram'],
    feat_t: 'Всё, чтобы продавать в Direct', feat_d: 'Одна платформа вместо пяти сервисов и менеджера на ночную смену.',
    f: {
      ai: ['AI-продавец', 'Понимает вопросы клиентов на таджикском, русском, узбекском и английском. Называет цены из каталога, отвечает на вопросы и записывает клиентов.'],
      flows: ['Конструктор сценариев', 'Соберите воронку из блоков: сообщения, кнопки, вопросы, условия, теги.'],
      comments: ['Комментарии → Direct', 'Пишут «цена» под постом — бот отвечает в комментарии и отправляет сообщение в Direct.'],
      crm: ['CRM и воронка', 'Каждый клиент — карточка с этапом, суммой сделки, задачами и историей.'],
      tg: ['Заявки в Telegram', 'Новая заявка с именем и телефоном — сразу вам в Telegram.'],
      bc: ['Рассылки', 'Сообщение всем, кто писал за последние 24 часа, — по тегу или этапу.'],
      catalog: ['Каталог товаров', 'Карточки с фото, ценой и кнопкой «Заказать» прямо в Direct.'],
      team: ['Команда', 'Продавцы со своими входами, автораспределение клиентов и общий чат.'],
    },
    how_t: 'Запуск за 3 шага', how: [
      ['Подключите Instagram', 'Вход через официальное окно Instagram. Пароль не нужен — 30 секунд.'],
      ['Расскажите о бизнесе', 'Опишите товары и цены своими словами — AI-продавец всё запомнит.'],
      ['Получайте заявки', 'ChatFlow отвечает клиентам 24/7, а вы получаете готовые заявки в Telegram.'],
    ],
    stats: [['2 сек', 'время ответа'], ['24/7', 'без выходных'], ['4 языка', 'тоҷикӣ, русский, o‘zbek, English'], ['5 мин', 'до первой заявки']],
    price_t: 'Простые тарифы', price_d: '7 дней бесплатно на любом тарифе. Карта не нужна.', per: 'сомони / мес', popular: 'Популярный',
    plans: {
      pro: ['Pro', 'Для одного бизнеса', ['1 аккаунт Instagram', 'AI-продавец', 'Безлимитные сценарии', 'CRM, чаты и рассылки', 'Заявки в Telegram']],
      business: ['Business', 'Для сетей и агентств', ['3 аккаунта Instagram', 'Всё из Pro', 'Команда продавцов', 'Аналитика с графиками', 'Приоритетная поддержка']],
    } as Record<string, [string, string, string[]]>,
    choose: 'Начать бесплатно',
    faq_t: 'Частые вопросы', faq: [
      ['Нужен ли пароль от Instagram?', 'Нет. Подключение идёт через официальное окно Instagram (API Meta). Мы не видим и не храним ваш пароль.'],
      ['Не заблокируют ли аккаунт?', 'ChatFlow работает только через официальный API Meta и соблюдает его правила — это не «серый» бот и не накрутка.'],
      ['Какой аккаунт нужен?', 'Профессиональный аккаунт Instagram — «Бизнес» или «Автор». Переключить можно бесплатно в настройках Instagram за минуту.'],
      ['На каком языке отвечает AI?', 'На языке клиента: таджикский, русский, узбекский или английский — определяет автоматически.'],
      ['Что будет после 7 дней?', 'Вы выбираете тариф и продолжаете. Если не продлите — автоматизация просто остановится, данные сохранятся.'],
    ],
    final_t: 'Пусть Instagram работает, пока вы отдыхаете', final_d: 'Подключите аккаунт сегодня — первые заявки придут уже вечером.',
    foot: 'Автоматизация Instagram для малого бизнеса',
  },
  uz: {
    nav: ['Imkoniyatlar', 'Qanday ishlaydi', 'Tariflar', 'Savollar'], login: 'Kirish', start: 'Bepul boshlash', dash: 'Panelni ochish',
    chip: 'Instagram avtomatlashtirish + AI',
    h1a: 'Instagram', h1b: 'o‘zi sotadi', h1c: '— siz uxlayotganingizda',
    sub: 'ChatFlow kommentariya va Direct xabarlariga 2 soniyada javob beradi, narxlarni aytadi, telefon raqamlarni yig‘adi va arizalarni Telegram’ingizga yuboradi.',
    cta: '7 kun bepul sinab ko‘rish', cta2: 'Qanday ishlaydi',
    trust: ['Bank kartasi shart emas', 'Meta rasmiy API', '5 daqiqada ishga tushadi'],
    chat: [
      { who: 'in', text: 'Assalomu alaykum! Kurs narxi qancha?' },
      { who: 'out', text: 'Va alaykum assalom! 😊 Qaysi kurs qiziqtiradi — ingliz tili yoki IT?' },
      { who: 'in', text: 'Ingliz tili' },
      { who: 'out', text: 'Ingliz tili — oyiga 450 000 so‘m, haftada 3 marta. Yozib qo‘yaymi? Ism va raqamingizni yozing 📱' },
      { who: 'in', text: 'Madina, +998 90 123 45 67' },
      { who: 'out', text: 'Rahmat, Madina! Menejer bugun siz bilan bog‘lanadi ✅' },
    ] as Chat,
    comment: 'izoh qoldirdi: narxi? 😍', online: 'onlayn', ai: 'AI sotuvchi', reply_in: '2 soniyada javob',
    lead_t: 'Yangi ariza', lead_d: 'Madina · +998 90 123 45 67 · Ingliz tili',
    niches: ['O‘quv markazlar', 'Kiyim do‘konlari', 'Go‘zallik salonlari', 'Klinikalar', 'Restoranlar', 'Onlayn maktablar', 'Blogerlar', 'Turagentliklar', 'Avtoservislar', 'Qandolatchilar'],
    pain_t: 'Javobsiz qolgan har bir «narxi?» — raqobatchiga ketgan mijoz',
    without: 'ChatFlow’siz', with: 'ChatFlow bilan',
    pain: ['3 soatdan keyin javob — mijoz allaqachon boshqadan olgan', 'Kechasi va dam olish kunlari Direct jim', 'Bir xil savollar kuniga 50 marta', 'Mijoz raqamlari yozishmalarda yo‘qoladi'],
    gain: ['2 soniyada javob — kechayu kunduz', 'AI sotuvchi 24/7, dam olishsiz ishlaydi', 'Narxlar va katalog avtomatik yuboriladi', 'Barcha arizalar — CRM’da va Telegram’ingizda'],
    feat_t: 'Direct’da sotish uchun hammasi', feat_d: 'Beshta servis va tungi smenadagi menejer o‘rniga bitta platforma.',
    f: {
      ai: ['AI sotuvchi', 'Mijoz savollarini tojik, rus, o‘zbek va ingliz tilida tushunadi. Katalogdan narx aytadi, savollarga javob beradi va mijozlarni yozib oladi.'],
      flows: ['Ssenariy konstruktori', 'Bloklardan voronka yig‘ing: xabarlar, tugmalar, savollar, shartlar, teglar.'],
      comments: ['Komment → Direct', 'Post ostiga «narxi» deb yozishadi — bot kommentga javob beradi va Direct’ga xabar yuboradi.'],
      crm: ['CRM va voronka', 'Har bir mijoz — bosqich, bitim summasi, vazifalar va tarixga ega kartochka.'],
      tg: ['Arizalar Telegram’da', 'Ism va raqamli yangi ariza — darhol Telegram’ingizga.'],
      bc: ['Rassilkalar', 'So‘nggi 24 soatda yozganlarning barchasiga xabar — teg yoki bosqich bo‘yicha.'],
      catalog: ['Tovarlar katalogi', 'Rasm, narx va «Buyurtma» tugmali kartochkalar to‘g‘ridan-to‘g‘ri Direct’da.'],
      team: ['Jamoa', 'Sotuvchilar o‘z logini bilan, mijozlarni avtotaqsimlash va umumiy chat.'],
    },
    how_t: '3 qadamda ishga tushirish', how: [
      ['Instagram’ni ulang', 'Rasmiy Instagram oynasi orqali kirish. Parol kerak emas — 30 soniya.'],
      ['Biznesingiz haqida yozing', 'Tovar va narxlarni o‘z so‘zlaringiz bilan yozing — AI sotuvchi hammasini eslab qoladi.'],
      ['Arizalarni oling', 'ChatFlow mijozlarga 24/7 javob beradi, siz esa tayyor arizalarni Telegram’da olasiz.'],
    ],
    stats: [['2 son.', 'javob vaqti'], ['24/7', 'dam olishsiz'], ['4 til', 'тоҷикӣ, русский, o‘zbek, English'], ['5 daq.', 'birinchi arizagacha']],
    price_t: 'Oddiy tariflar', price_d: 'Har qanday tarifda 7 kun bepul. Karta kerak emas.', per: 'somoniy / oy', popular: 'Ommabop',
    plans: {
      pro: ['Pro', 'Bitta biznes uchun', ['1 ta Instagram akkaunt', 'AI sotuvchi', 'Cheksiz ssenariylar', 'CRM, chatlar va rassilkalar', 'Arizalar Telegram’da']],
      business: ['Business', 'Tarmoqlar va agentliklar uchun', ['3 ta Instagram akkaunt', 'Pro’dagi hammasi', 'Sotuvchilar jamoasi', 'Grafikli statistika', 'Birinchi navbatdagi yordam']],
    } as Record<string, [string, string, string[]]>,
    choose: 'Bepul boshlash',
    faq_t: 'Ko‘p beriladigan savollar', faq: [
      ['Instagram paroli kerakmi?', 'Yo‘q. Ulanish rasmiy Instagram oynasi (Meta API) orqali. Parolingizni ko‘rmaymiz va saqlamaymiz.'],
      ['Akkaunt bloklanib qolmaydimi?', 'ChatFlow faqat Meta rasmiy API orqali ishlaydi va qoidalariga amal qiladi — bu «kulrang» bot yoki nakrutka emas.'],
      ['Qanday akkaunt kerak?', 'Professional Instagram akkaunt — «Biznes» yoki «Avtor». Instagram sozlamalarida bepul, bir daqiqada o‘tkaziladi.'],
      ['AI qaysi tilda javob beradi?', 'Mijozning tilida: tojik, rus, o‘zbek yoki ingliz — avtomatik aniqlaydi.'],
      ['7 kundan keyin nima bo‘ladi?', 'Tarif tanlab davom etasiz. Uzaytirmasangiz — avtomatlashtirish to‘xtaydi, ma’lumotlar saqlanadi.'],
    ],
    final_t: 'Siz dam olayotganda Instagram ishlasin', final_d: 'Akkauntni bugun ulang — birinchi arizalar kechqurunoq keladi.',
    foot: 'Kichik biznes uchun Instagram avtomatlashtirish',
  },
  tj: {
    nav: ['Имкониятҳо', 'Чӣ тавр кор мекунад', 'Тарифҳо', 'Саволҳо'], login: 'Ворид шудан', start: 'Ройгон оғоз кунед', dash: 'Кушодани панел',
    chip: 'Автоматикунонии Instagram + AI',
    h1a: 'Instagram', h1b: 'худаш мефурӯшад', h1c: '— вақте ки шумо хобед',
    sub: 'ChatFlow ба шарҳҳо ва паёмҳои Direct дар 2 сония ҷавоб медиҳад, нархҳоро мегӯяд, рақамҳоро ҷамъ мекунад ва дархостҳоро ба Telegram-и шумо мефиристад.',
    cta: '7 рӯз ройгон санҷед', cta2: 'Чӣ тавр кор мекунад',
    trust: ['Корти бонкӣ лозим нест', 'API-и расмии Meta', 'Оғоз дар 5 дақиқа'],
    chat: [
      { who: 'in', text: 'Ассалому алейкум! Нархи курс чанд аст?' },
      { who: 'out', text: 'Ваалейкум ассалом! 😊 Кадом курс шуморо таваҷҷӯҳ дорад — англисӣ ё IT?' },
      { who: 'in', text: 'Англисӣ' },
      { who: 'out', text: 'Англисӣ — 450 сомонӣ дар як моҳ, ҳафтае 3 маротиба. Сабт кунам? Ном ва рақамро нависед 📱' },
      { who: 'in', text: 'Мадина, +992 90 123 45 67' },
      { who: 'out', text: 'Ташаккур, Мадина! Менеҷер имрӯз бо шумо тамос мегирад ✅' },
    ] as Chat,
    comment: 'шарҳ гузошт: нарх? 😍', online: 'онлайн', ai: 'AI-фурӯшанда', reply_in: 'Ҷавоб дар 2 сония',
    lead_t: 'Дархости нав', lead_d: 'Мадина · +992 90 123 45 67 · Англисӣ',
    niches: ['Марказҳои таълимӣ', 'Мағозаҳои либос', 'Салонҳои зебоӣ', 'Клиникаҳо', 'Тарабхонаҳо', 'Мактабҳои онлайн', 'Блогерҳо', 'Турагентиҳо', 'Автосервисҳо', 'Қаннодиҳо'],
    pain_t: 'Ҳар «нарх?»-и бе ҷавоб — мизоҷест, ки ба рақиб рафт',
    without: 'Бе ChatFlow', with: 'Бо ChatFlow',
    pain: ['Пас аз 3 соат ҷавоб — мизоҷ аллакай аз дигарон харид', 'Шабона ва рӯзҳои истироҳат Direct хомӯш', 'Ҳамон саволҳо рӯзе 50 маротиба', 'Рақамҳои мизоҷон дар мукотиба гум мешаванд'],
    gain: ['Ҷавоб дар 2 сония — шабу рӯз', 'AI-фурӯшанда 24/7 бе истироҳат', 'Нархҳо ва каталог худкор фиристода мешаванд', 'Ҳамаи дархостҳо — дар CRM ва Telegram-и шумо'],
    feat_t: 'Ҳама чиз барои фурӯш дар Direct', feat_d: 'Як платформа ба ҷои панҷ хизматрасонӣ ва менеҷери навбати шабона.',
    f: {
      ai: ['AI-фурӯшанда', 'Саволҳои мизоҷонро бо забонҳои тоҷикӣ, русӣ, ӯзбекӣ ва англисӣ мефаҳмад. Нархҳоро аз каталог мегӯяд, ба саволҳо ҷавоб медиҳад ва мизоҷонро сабт мекунад.'],
      flows: ['Конструктори сенария', 'Аз блокҳо воронка созед: паёмҳо, тугмаҳо, саволҳо, шартҳо, тегҳо.'],
      comments: ['Шарҳ → Direct', 'Зери пост «нарх» менависанд — бот ба шарҳ ҷавоб медиҳад ва ба Direct паём мефиристад.'],
      crm: ['CRM ва воронка', 'Ҳар мизоҷ — корт бо марҳила, маблағи аҳд, вазифаҳо ва таърих.'],
      tg: ['Дархостҳо дар Telegram', 'Дархости нав бо ном ва рақам — фавран ба Telegram-и шумо.'],
      bc: ['Паёмҳои оммавӣ', 'Паём ба ҳамаи онҳое, ки дар 24 соати охир навиштаанд — аз рӯи тег ё марҳила.'],
      catalog: ['Каталоги мол', 'Кортҳо бо акс, нарх ва тугмаи «Фармоиш» бевосита дар Direct.'],
      team: ['Даста', 'Фурӯшандагон бо воридшавии худ, тақсимоти худкори мизоҷон ва чати умумӣ.'],
    },
    how_t: 'Оғоз дар 3 қадам', how: [
      ['Instagram-ро пайваст кунед', 'Воридшавӣ тавассути равзанаи расмии Instagram. Парол лозим нест — 30 сония.'],
      ['Дар бораи бизнес нависед', 'Мол ва нархҳоро бо суханони худ нависед — AI-фурӯшанда ҳамаашро дар хотир нигоҳ медорад.'],
      ['Дархостҳо гиред', 'ChatFlow ба мизоҷон 24/7 ҷавоб медиҳад, шумо дархостҳои тайёрро дар Telegram мегиред.'],
    ],
    stats: [['2 сон.', 'вақти ҷавоб'], ['24/7', 'бе истироҳат'], ['4 забон', 'тоҷикӣ, русский, o‘zbek, English'], ['5 дақ.', 'то дархости аввал']],
    price_t: 'Тарифҳои содда', price_d: 'Дар ҳар тариф 7 рӯз ройгон. Корт лозим нест.', per: 'сомонӣ / моҳ', popular: 'Маъмул',
    plans: {
      pro: ['Pro', 'Барои як бизнес', ['1 аккаунти Instagram', 'AI-фурӯшанда', 'Сенарияҳои бемаҳдуд', 'CRM, чатҳо ва паёмҳои оммавӣ', 'Дархостҳо дар Telegram']],
      business: ['Business', 'Барои шабакаҳо ва агентиҳо', ['3 аккаунти Instagram', 'Ҳама чиз аз Pro', 'Дастаи фурӯшандагон', 'Таҳлил бо графикҳо', 'Дастгирии афзалиятнок']],
    } as Record<string, [string, string, string[]]>,
    choose: 'Ройгон оғоз кунед',
    faq_t: 'Саволҳои маъмул', faq: [
      ['Пароли Instagram лозим аст?', 'Не. Пайвастшавӣ тавассути равзанаи расмии Instagram (API-и Meta). Мо пароли шуморо намебинем ва нигоҳ намедорем.'],
      ['Аккаунт баста намешавад?', 'ChatFlow танҳо тавассути API-и расмии Meta кор мекунад ва қоидаҳои онро риоя мекунад — ин боти «хокистарӣ» нест.'],
      ['Кадом аккаунт лозим аст?', 'Аккаунти касбии Instagram — «Бизнес» ё «Муаллиф». Дар танзимоти Instagram ройгон, дар як дақиқа иваз мешавад.'],
      ['AI бо кадом забон ҷавоб медиҳад?', 'Бо забони мизоҷ: тоҷикӣ, русӣ, ӯзбекӣ ё англисӣ — худкор муайян мекунад.'],
      ['Баъди 7 рӯз чӣ мешавад?', 'Тариф интихоб карда идома медиҳед. Агар дароз накунед — автоматика қатъ мешавад, маълумот боқӣ мемонад.'],
    ],
    final_t: 'Бигзор Instagram кор кунад, вақте ки шумо истироҳат мекунед', final_d: 'Аккаунтро имрӯз пайваст кунед — дархостҳои аввал бегоҳ меоянд.',
    foot: 'Автоматикунонии Instagram барои бизнеси хурд',
  },
  en: {
    nav: ['Features', 'How it works', 'Pricing', 'FAQ'], login: 'Log in', start: 'Start free', dash: 'Open dashboard',
    chip: 'Instagram automation + AI',
    h1a: 'Instagram', h1b: 'sells on its own', h1c: '— while you sleep',
    sub: 'ChatFlow answers comments and Direct messages in 2 seconds, shares prices, collects phone numbers and sends the leads to your Telegram.',
    cta: 'Try free for 7 days', cta2: 'How it works',
    trust: ['No credit card', 'Official Meta API', 'Live in 5 minutes'],
    chat: [
      { who: 'in', text: 'Hi! How much is the course?' },
      { who: 'out', text: 'Hi there! 😊 Which course are you interested in — English or IT?' },
      { who: 'in', text: 'English' },
      { who: 'out', text: 'English is $45 a month, 3 classes a week. Shall I sign you up? Send your name and number 📱' },
      { who: 'in', text: 'Madina, +992 90 123 45 67' },
      { who: 'out', text: 'Thanks, Madina! A manager will call you today ✅' },
    ] as Chat,
    comment: 'commented: price? 😍', online: 'online', ai: 'AI seller', reply_in: 'Replied in 2s',
    lead_t: 'New lead', lead_d: 'Madina · +992 90 123 45 67 · English',
    niches: ['Learning centers', 'Clothing stores', 'Beauty salons', 'Clinics', 'Restaurants', 'Online schools', 'Creators', 'Travel agencies', 'Car services', 'Bakeries'],
    pain_t: 'Every unanswered “price?” is a customer who went to a competitor',
    without: 'Without ChatFlow', with: 'With ChatFlow',
    pain: ['You reply 3 hours later — they already bought elsewhere', 'Direct goes silent at night and on weekends', 'The same questions 50 times a day', 'Phone numbers get lost in the chat'],
    gain: ['Replies in 2 seconds — day and night', 'An AI seller that works 24/7', 'Prices and catalog sent automatically', 'Every lead — in the CRM and your Telegram'],
    feat_t: 'Everything to sell in Direct', feat_d: 'One platform instead of five tools and a night-shift manager.',
    f: {
      ai: ['AI seller', 'Understands customers in Tajik, Russian, Uzbek and English. Quotes prices from your catalog, answers questions and books customers.'],
      flows: ['Flow builder', 'Build a funnel from blocks: messages, buttons, questions, conditions, tags.'],
      comments: ['Comments → Direct', 'Someone writes “price” under a post — the bot replies to the comment and sends a DM.'],
      crm: ['CRM & pipeline', 'Every customer is a card with a stage, deal value, tasks and history.'],
      tg: ['Leads in Telegram', 'New lead with name and phone — straight to your Telegram.'],
      bc: ['Broadcasts', 'Message everyone who wrote in the last 24 hours — by tag or stage.'],
      catalog: ['Product catalog', 'Cards with photo, price and an “Order” button right in Direct.'],
      team: ['Team', 'Sellers with their own logins, auto-assignment and a shared inbox.'],
    },
    how_t: 'Live in 3 steps', how: [
      ['Connect Instagram', 'Log in through the official Instagram window. No password — 30 seconds.'],
      ['Describe your business', 'Write your products and prices in your own words — the AI seller remembers it all.'],
      ['Get leads', 'ChatFlow answers customers 24/7 and you get ready leads in Telegram.'],
    ],
    stats: [['2 sec', 'reply time'], ['24/7', 'no days off'], ['4 languages', 'тоҷикӣ, русский, o‘zbek, English'], ['5 min', 'to your first lead']],
    price_t: 'Simple pricing', price_d: '7 days free on any plan. No card needed.', per: 'TJS / month', popular: 'Popular',
    plans: {
      pro: ['Pro', 'For one business', ['1 Instagram account', 'AI seller', 'Unlimited flows', 'CRM, inbox and broadcasts', 'Leads in Telegram']],
      business: ['Business', 'For chains and agencies', ['3 Instagram accounts', 'Everything in Pro', 'Sales team', 'Analytics with charts', 'Priority support']],
    } as Record<string, [string, string, string[]]>,
    choose: 'Start free',
    faq_t: 'FAQ', faq: [
      ['Do you need my Instagram password?', 'No. You connect through the official Instagram window (Meta API). We never see or store your password.'],
      ['Can my account get banned?', 'ChatFlow works only through the official Meta API and follows its rules — it is not a grey-hat bot.'],
      ['What account do I need?', 'A professional Instagram account — Business or Creator. Switching is free and takes a minute in Instagram settings.'],
      ['Which language does the AI reply in?', 'In the customer’s language: Tajik, Russian, Uzbek or English — detected automatically.'],
      ['What happens after 7 days?', 'Pick a plan and keep going. If you don’t, automation simply pauses and your data stays.'],
    ],
    final_t: 'Let Instagram work while you rest', final_d: 'Connect your account today — the first leads arrive tonight.',
    foot: 'Instagram automation for small business',
  },
}
type LT = (typeof TX)['ru']

/* ================================================================== yordamchilar */

/** Ekranga chiqqanda paydo bo'lish */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVis(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect() } }, { rootMargin: '0px 0px -60px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${vis ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}

const Igrad = 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]'

/* ================================================================== hero: jonli chat */

function HeroPhone({ L }: { L: LT }) {
  // qadamlar: 0 — izoh bildirishnomasi, 1..n — xabarlar (javobdan oldin "yozmoqda"), oxiri — Telegram ariza
  const n = L.chat.length
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    setStep(0); setTyping(false)
  }, [L])
  useEffect(() => {
    let tm: number
    if (step < n) {
      const nextOut = L.chat[step]?.who === 'out'
      if (nextOut && !typing) {
        tm = window.setTimeout(() => setTyping(true), 500)
      } else {
        tm = window.setTimeout(() => { setTyping(false); setStep(s => s + 1) }, nextOut ? 1100 : step === 0 ? 1500 : 1300)
      }
    } else if (step === n) {
      tm = window.setTimeout(() => setStep(n + 1), 700)
    } else {
      tm = window.setTimeout(() => { setStep(0); setTyping(false) }, 4200)
    }
    return () => window.clearTimeout(tm)
  }, [step, typing, n, L])
  const shown = L.chat.slice(0, Math.min(step, n))
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' }) }, [step, typing])

  return (
    <div className="relative mx-auto w-full max-w-[400px] select-none">
      <div className="pointer-events-none absolute inset-x-6 top-10 bottom-0 rounded-[60px] bg-brand-600/25 blur-[70px]" />
      {/* telefon */}
      <div className="relative mx-auto w-[290px] rounded-[46px] bg-[#0d0d10] p-[10px] shadow-[0_40px_80px_-30px_rgba(17,17,20,.55)] sm:w-[310px]">
        <div className="relative overflow-hidden rounded-[37px] bg-white">
          <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#0d0d10]" />
          {/* sarlavha */}
          <div className="flex items-center gap-2.5 border-b border-line px-4 pb-2.5 pt-10">
            <span className={`grid h-9 w-9 place-items-center rounded-full ${Igrad} p-[2px]`}><span className="grid h-full w-full place-items-center rounded-full bg-white text-[13px] font-extrabold text-brand-600">C</span></span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13.5px] font-bold">your_brand</div>
              <div className="flex items-center gap-1 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{L.online}</div>
            </div>
            <Bot className="h-4 w-4 text-violet-500" />
          </div>
          {/* xabarlar */}
          <div ref={body} className="flex h-[420px] flex-col gap-2 overflow-hidden px-3 py-3 sm:h-[440px]">
            <div className="mx-auto mb-1 rounded-full bg-soft px-3 py-1 text-[10.5px] font-semibold text-ink-3">Direct</div>
            {shown.map((m, i) => (
              m.who === 'in' ? (
                <div key={i} className="msg-in max-w-[80%] self-start rounded-[18px] rounded-bl-md bg-[#efeff3] px-3 py-2 text-[13px] leading-snug">{m.text}</div>
              ) : (
                <div key={i} className="msg-in flex max-w-[84%] flex-col items-end self-end">
                  <div className="rounded-[18px] rounded-br-md bg-gradient-to-br from-[#7b5cff] to-[#b04cf0] px-3 py-2 text-[13px] leading-snug text-white">{m.text}</div>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-ink-4"><Sparkles className="h-2.5 w-2.5" />{L.ai}</span>
                </div>
              )
            ))}
            {typing && (
              <div className="msg-in flex gap-1 self-end rounded-[18px] rounded-br-md bg-[#efe9ff] px-3.5 py-3">
                {[0, 1, 2].map(i => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-violet-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
            <span className="h-8 flex-1 rounded-full bg-soft" />
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white"><Send className="h-3.5 w-3.5" /></span>
          </div>
        </div>
      </div>

      {/* izoh kartasi */}
      <div className={`absolute -left-1 -top-3 z-10 w-[200px] rounded-2xl border border-line bg-white p-3 shadow-pop transition-all duration-500 sm:-left-16 ${step >= 0 ? 'opacity-100' : 'opacity-0'}`} style={{ animation: 'float 6s ease-in-out infinite' }}>
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${Igrad} text-[11px] font-bold text-white`}>M</span>
          <div className="min-w-0 text-[11.5px] leading-snug"><b>madina_dsh</b> <span className="text-ink-3">{L.comment}</span></div>
        </div>
      </div>
      {/* tezlik */}
      <div className="absolute -right-1 top-[46%] rounded-2xl border border-line bg-white px-3 py-2 shadow-pop sm:-right-8" style={{ animation: 'float 5s ease-in-out 1.5s infinite' }}>
        <div className="flex items-center gap-2 text-[12px] font-bold"><span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Zap className="h-3.5 w-3.5" /></span>{L.reply_in}</div>
      </div>
      {/* telegram ariza */}
      {step > n && (
        <div className="toast-in absolute -right-1 bottom-10 w-[240px] rounded-2xl bg-ink p-3 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,.6)] sm:-right-12">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#2aa3e0]"><Send className="h-4 w-4" /></span>
            <div className="min-w-0 leading-tight">
              <div className="text-[12.5px] font-bold">🔥 {L.lead_t}</div>
              <div className="truncate text-[11px] text-white/65">{L.lead_d}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== bento mini-vizuallar */

function MiniFlow() {
  return (
    <div className="relative h-[120px]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 120" preserveAspectRatio="none" fill="none" aria-hidden>
        <path d="M86 30 C 120 30, 118 60, 150 60" stroke="#e5161f" strokeWidth="2" strokeDasharray="5 4" className="animate-dash" />
        <path d="M206 60 C 236 60, 232 92, 262 92" stroke="#d4d4dc" strokeWidth="2" />
      </svg>
      <div className="absolute left-0 top-3 flex items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-2 text-[11.5px] font-semibold shadow-node"><span className="grid h-5 w-5 place-items-center rounded-md bg-brand-600 text-white"><Zap className="h-3 w-3" /></span>Trigger</div>
      <div className="absolute left-[38%] top-[42px] flex items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-2 text-[11.5px] font-semibold shadow-node"><span className="grid h-5 w-5 place-items-center rounded-md bg-ink text-white"><MessageCircle className="h-3 w-3" /></span>Direct</div>
      <div className="absolute right-0 top-[76px] flex items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-2 text-[11.5px] font-semibold shadow-node"><span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>Lead</div>
    </div>
  )
}

function MiniCrm() {
  const cols = [['#0ea5e9', 3], ['#8b5cf6', 2], ['#f59e0b', 2], ['#10b981', 1]] as const
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cols.map(([c, k], i) => (
        <div key={i} className="rounded-xl bg-soft p-1.5">
          <div className="mb-1.5 h-1.5 w-6 rounded-full" style={{ background: c }} />
          {Array.from({ length: k }).map((_, j) => <div key={j} className="mb-1 h-5 rounded-md bg-white shadow-card" />)}
        </div>
      ))}
    </div>
  )
}

/* ================================================================== sahifa */

export default function Landing() {
  const { lang } = useI18n()
  const L = TX[(lang in TX ? lang : 'ru') as keyof typeof TX]
  const { me } = useAuth()
  const cta = me ? '/app' : '/register'
  const [prices, setPrices] = useState<Record<string, number>>({ pro: 199, business: 499 })
  const [faq, setFaq] = useState<number | null>(0)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    fetch('/api/public/plans').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.plans) setPrices(Object.fromEntries(d.plans.map((p: { key: string; price: number }) => [p.key, p.price])))
    }).catch(() => {})
  }, [])
  const anchors = ['features', 'how', 'pricing', 'faq']

  const ctaBtn = (label: string, big = true) => (
    <Link to={cta} className={`group inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 font-semibold text-white shadow-[0_14px_30px_-10px_rgba(229,22,31,.65)] transition hover:bg-brand-700 ${big ? 'h-14 px-7 text-[16px]' : 'h-11 px-5 text-[14.5px]'}`}>
      {label}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </Link>
  )

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* ---------------- header */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="shrink-0"><Logo size={30} /></Link>
          <nav className="hidden items-center gap-1 text-[14px] font-medium text-ink-2 lg:flex">
            {L.nav.map((x, i) => <a key={x} href={`#${anchors[i]}`} className="rounded-lg px-3 py-2 transition hover:bg-soft hover:text-ink">{x}</a>)}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <LangSwitch />
            {!me && <Link to="/login" className="hidden rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-soft sm:block">{L.login}</Link>}
            <Link to={cta} className="hidden rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-black sm:block">{me ? L.dash : L.start}</Link>
            <button onClick={() => setMenu(m => !m)} className="rounded-lg p-2 hover:bg-soft lg:hidden" aria-label="menu">{menu ? <X className="h-5 w-5" /> : <span className="flex w-5 flex-col gap-[5px]"><span className="h-0.5 rounded bg-ink" /><span className="h-0.5 rounded bg-ink" /></span>}</button>
          </div>
        </div>
        {menu && (
          <div className="animate-fade-up border-t border-line bg-white px-4 pb-4 pt-2 lg:hidden">
            {L.nav.map((x, i) => <a key={x} href={`#${anchors[i]}`} onClick={() => setMenu(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold hover:bg-soft">{x}</a>)}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {!me && <Link to="/login" className="flex h-11 items-center justify-center rounded-xl border border-line text-[14px] font-semibold">{L.login}</Link>}
              <Link to={cta} className={`flex h-11 items-center justify-center rounded-xl bg-brand-600 text-[14px] font-semibold text-white ${me ? 'col-span-2' : ''}`}>{me ? L.dash : L.start}</Link>
            </div>
          </div>
        )}
      </header>

      {/* ---------------- hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(17,17,20,.06)_1px,transparent_0)] [background-size:26px_26px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="pointer-events-none absolute -right-48 -top-48 h-[620px] w-[620px] rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div className="animate-fade-up text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 shadow-card">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" /></span>
              {L.chip}
            </span>
            <h1 className="mt-6 text-[44px] font-black leading-[0.98] tracking-[-0.045em] sm:text-[64px] lg:text-[72px]">
              {L.h1a}<br /><span className="relative whitespace-nowrap text-brand-600">{L.h1b}
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none" aria-hidden><path d="M2 9 C 80 2, 200 2, 298 7" stroke="#e5161f" strokeWidth="4" strokeLinecap="round" opacity=".3" /></svg>
              </span>
              <span className="mt-3 block text-[24px] font-bold tracking-[-0.02em] text-ink-3 sm:text-[30px]">{L.h1c}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[16.5px] leading-relaxed text-ink-3 sm:text-[18px] lg:mx-0">{L.sub}</p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              {ctaBtn(L.cta)}
              <a href="#how" className="inline-flex h-14 items-center justify-center rounded-2xl border border-line bg-white px-7 text-[16px] font-semibold transition hover:bg-soft">{L.cta2}</a>
            </div>
            <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] font-medium text-ink-2 lg:justify-start">
              {L.trust.map(x => <li key={x} className="flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-2.5 w-2.5" strokeWidth={4} /></span>{x}</li>)}
            </ul>
          </div>
          <HeroPhone L={L} />
        </div>
      </section>

      {/* ---------------- nishalar lentasi */}
      <div className="relative overflow-hidden border-y border-line bg-soft py-4 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-marquee flex w-max gap-3">
          {[...L.niches, ...L.niches].map((x, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[15px] font-semibold text-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-brand-600" />{x}</span>
          ))}
        </div>
      </div>

      {/* ---------------- muammo / yechim */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal><h2 className="mx-auto max-w-3xl text-center text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[44px]">{L.pain_t}</h2></Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-[28px] border border-line bg-soft p-6 sm:p-8">
                <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-4"><X className="h-4 w-4" />{L.without}</div>
                <ul className="mt-6 space-y-4">
                  {L.pain.map(x => <li key={x} className="flex items-start gap-3 text-[15.5px] text-ink-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-ink-4 ring-1 ring-line"><X className="h-3.5 w-3.5" /></span>{x}</li>)}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative h-full overflow-hidden rounded-[28px] bg-ink p-6 text-white sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/40 blur-3xl" />
                <div className="relative flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-brand-400"><Check className="h-4 w-4" strokeWidth={3} />{L.with}</div>
                <ul className="relative mt-6 space-y-4">
                  {L.gain.map(x => <li key={x} className="flex items-start gap-3 text-[15.5px] text-white/90"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{x}</li>)}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- imkoniyatlar (bento) */}
      <section id="features" className="scroll-mt-16 bg-soft py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="max-w-2xl text-[32px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[46px]">{L.feat_t}</h2>
            <p className="mt-4 max-w-xl text-[16.5px] text-ink-3">{L.feat_d}</p>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-6">
            {/* AI */}
            <Reveal className="md:col-span-4">
              <div className="relative h-full overflow-hidden rounded-[28px] bg-gradient-to-br from-[#16131f] via-[#1d1428] to-[#2a0f17] p-6 text-white sm:p-8">
                <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
                <div className="relative grid gap-6 sm:grid-cols-[1fr_1.05fr] sm:items-center">
                  <div>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#6d5dfc] to-[#e5161f]"><Sparkles className="h-5 w-5" /></span>
                    <h3 className="mt-5 text-[22px] font-bold">{L.f.ai[0]}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-white/65">{L.f.ai[1]}</p>
                    <div className="mt-5 flex flex-wrap gap-1.5">{['тоҷикӣ', 'русский', 'o‘zbek', 'English'].map(x => <span key={x} className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/80"><Globe2 className="mr-1 inline h-3 w-3" />{x}</span>)}</div>
                  </div>
                  <div className="space-y-2 rounded-2xl bg-white/[.06] p-3 ring-1 ring-white/10">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-[12.5px]">{L.chat[0].text}</div>
                    <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#7b5cff] to-[#b04cf0] px-3 py-2 text-[12.5px]">{L.chat[3].text}</div>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-[12.5px]">{L.chat[4].text}</div>
                  </div>
                </div>
              </div>
            </Reveal>
            {/* Telegram */}
            <Reveal className="md:col-span-2" delay={80}>
              <Tile icon={<Send className="h-5 w-5" />} tint="bg-sky-50 text-sky-600" t={L.f.tg[0]} d={L.f.tg[1]}>
                <div className="mt-5 rounded-2xl bg-ink p-3 text-white">
                  <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2aa3e0]"><Bell className="h-3.5 w-3.5" /></span><span className="text-[12.5px] font-bold">🔥 {L.lead_t}</span></div>
                  <div className="mt-1.5 truncate text-[11.5px] text-white/60">{L.lead_d}</div>
                </div>
              </Tile>
            </Reveal>
            {/* Flows */}
            <Reveal className="md:col-span-3">
              <Tile icon={<Workflow className="h-5 w-5" />} tint="bg-brand-50 text-brand-600" t={L.f.flows[0]} d={L.f.flows[1]}><div className="mt-5"><MiniFlow /></div></Tile>
            </Reveal>
            {/* CRM */}
            <Reveal className="md:col-span-3" delay={80}>
              <Tile icon={<KanbanSquare className="h-5 w-5" />} tint="bg-emerald-50 text-emerald-600" t={L.f.crm[0]} d={L.f.crm[1]}><div className="mt-5"><MiniCrm /></div></Tile>
            </Reveal>
            {/* kichik plitkalar */}
            {([['comments', AtSign, 'bg-pink-50 text-pink-600'], ['catalog', ShoppingBag, 'bg-amber-50 text-amber-600'], ['bc', Megaphone, 'bg-violet-50 text-violet-600'], ['team', UsersRound, 'bg-slate-100 text-slate-700']] as const).map(([k, Icon, tint], i) => (
              <Reveal key={k} className="md:col-span-3 lg:col-span-3 xl:col-span-3" delay={i * 60}>
                <Tile icon={<Icon className="h-5 w-5" />} tint={tint} t={L.f[k][0]} d={L.f[k][1]} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- qanday ishlaydi */}
      <section id="how" className="scroll-mt-16 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal><h2 className="text-center text-[32px] font-extrabold tracking-[-0.035em] sm:text-[46px]">{L.how_t}</h2></Reveal>
          <div className="relative mt-14 grid gap-5 md:grid-cols-3">
            <div className="pointer-events-none absolute left-[16%] right-[16%] top-7 hidden h-px border-t-2 border-dashed border-line md:block" />
            {L.how.map(([a, b], i) => (
              <Reveal key={a} delay={i * 120}>
                <div className="relative text-center">
                  <span className={`relative mx-auto grid h-14 w-14 place-items-center rounded-2xl text-[20px] font-black shadow-pop ${i === 2 ? 'bg-brand-600 text-white' : 'bg-white text-ink ring-1 ring-line'}`}>{i + 1}</span>
                  <h3 className="mt-5 text-[19px] font-bold">{a}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-3">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 flex justify-center">{ctaBtn(L.cta)}</Reveal>
        </div>
      </section>

      {/* ---------------- raqamlar */}
      <section className="px-4 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-brand-600 px-6 py-10 text-white sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,.14)_1px,transparent_0)] [background-size:22px_22px]" />
          <div className="relative grid grid-cols-2 gap-8 lg:grid-cols-4">
            {L.stats.map(([a, b], i) => (
              <Reveal key={a} delay={i * 80}>
                <div className="flex items-center gap-2 text-white/80">{[<Zap key={0} className="h-4 w-4" />, <Clock key={1} className="h-4 w-4" />, <Globe2 key={2} className="h-4 w-4" />, <Bot key={3} className="h-4 w-4" />][i]}</div>
                <div className="mt-2 text-[34px] font-black tracking-[-0.03em] sm:text-[44px]">{a}</div>
                <div className="text-[13.5px] leading-snug text-white/75">{b}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- tariflar */}
      <section id="pricing" className="scroll-mt-16 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="text-center">
            <h2 className="text-[32px] font-extrabold tracking-[-0.035em] sm:text-[46px]">{L.price_t}</h2>
            <p className="mt-3 text-[16.5px] text-ink-3">{L.price_d}</p>
          </Reveal>
          <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
            {(['pro', 'business'] as const).map((k, i) => {
              const [name, sub, items] = L.plans[k]
              const dark = k === 'business'
              return (
                <Reveal key={k} delay={i * 100}>
                  <div className={`relative flex h-full flex-col rounded-[28px] p-7 sm:p-8 ${dark ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
                    {k === 'pro' && <span className="absolute right-6 top-6 rounded-full bg-brand-600 px-2.5 py-1 text-[11.5px] font-bold text-white">{L.popular}</span>}
                    <div className="text-[20px] font-bold">{name}</div>
                    <div className={`text-[14px] ${dark ? 'text-white/60' : 'text-ink-3'}`}>{sub}</div>
                    <div className="mt-6 flex items-baseline gap-2">
                      <span className="text-[52px] font-black leading-none tracking-[-0.04em]">{prices[k]}</span>
                      <span className={`text-[14px] font-medium ${dark ? 'text-white/60' : 'text-ink-3'}`}>{L.per}</span>
                    </div>
                    <ul className="mt-7 flex-1 space-y-3">
                      {items.map(x => <li key={x} className="flex items-center gap-3 text-[15px]"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${dark ? 'bg-white/15' : 'bg-brand-50 text-brand-600'}`}><Check className="h-3 w-3" strokeWidth={3.5} /></span>{x}</li>)}
                    </ul>
                    <Link to={cta} className={`mt-8 flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition ${dark ? 'bg-white text-ink hover:bg-white/90' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>{L.choose}<ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------------- FAQ */}
      <section id="faq" className="scroll-mt-16 bg-soft py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal><h2 className="text-center text-[32px] font-extrabold tracking-[-0.035em] sm:text-[46px]">{L.faq_t}</h2></Reveal>
          <div className="mt-10 space-y-2.5">
            {L.faq.map(([q, a], i) => {
              const open = faq === i
              return (
                <div key={q} className={`overflow-hidden rounded-2xl bg-white ring-1 transition ${open ? 'ring-ink/15 shadow-pop' : 'ring-line'}`}>
                  <button onClick={() => setFaq(open ? null : i)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
                    <span className="flex-1 text-[15.5px] font-semibold">{q}</span>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${open ? 'rotate-45 bg-brand-600 text-white' : 'bg-soft text-ink-3'}`}><Plus className="h-4 w-4" /></span>
                  </button>
                  <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden"><p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-3">{a}</p></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------------- yakuniy CTA */}
      <section className="px-4 py-20 sm:px-6 sm:py-24">
        <Reveal>
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-ink px-6 py-14 text-center text-white sm:px-14 sm:py-20">
            <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand-600/45 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
            <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><ShieldCheck className="h-6 w-6 text-brand-400" /></span>
            <h2 className="relative mx-auto mt-6 max-w-2xl text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[46px]">{L.final_t}</h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[16.5px] text-white/65">{L.final_d}</p>
            <div className="relative mt-9 flex justify-center">{ctaBtn(L.cta)}</div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-10 text-[13px] text-ink-3 sm:flex-row sm:px-6">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo size={24} />
            <span>{L.foot} · © {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="/privacy" className="hover:text-ink">Privacy</a>
            <a href="/terms" className="hover:text-ink">Terms</a>
            <a href="/data-deletion" className="hover:text-ink">Data deletion</a>
            <a href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="inline-flex items-center gap-1 hover:text-ink"><ChevronDown className="h-3.5 w-3.5 rotate-180" />Top</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Tile({ icon, tint, t, d, children }: { icon: ReactNode; tint: string; t: string; d: string; children?: ReactNode }) {
  return (
    <div className="h-full rounded-[28px] border border-line bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-pop sm:p-7">
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ${tint}`}>{icon}</span>
      <h3 className="mt-5 text-[18px] font-bold">{t}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{d}</p>
      {children}
    </div>
  )
}
