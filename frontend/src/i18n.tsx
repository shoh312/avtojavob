import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'tj' | 'ru' | 'uz' | 'en'
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'tj', label: 'Тоҷикӣ', short: 'TJ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'en', label: 'English', short: 'EN' },
]

const en = {
  // umumiy
  'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete', 'common.edit': 'Edit',
  'common.open': 'Open', 'common.duplicate': 'Duplicate', 'common.close': 'Close', 'common.search': 'Search',
  'common.loading': 'Loading…', 'common.saved': 'Saved', 'common.saving': 'Saving…', 'common.error': 'Something went wrong',
  'common.confirm_delete': 'Delete for good?', 'common.back': 'Back', 'common.add': 'Add', 'common.active': 'Active',
  'common.paused': 'Paused', 'common.draft': 'Draft', 'common.all': 'All', 'common.yes': 'Yes', 'common.no': 'No',
  'common.export': 'Export CSV', 'common.empty': 'Nothing here yet',
  'time.now': 'just now', 'time.min': '{n} min ago', 'time.hour': '{n} h ago', 'time.day': '{n} d ago',

  // landing
  'land.nav.features': 'Features', 'land.nav.how': 'How it works', 'land.login': 'Log in', 'land.start': 'Start free',
  'land.badge': 'Instagram automation',
  'land.title1': 'Turn comments into', 'land.title2': 'customers', 'land.title3': 'on autopilot',
  'land.sub': 'ChatFlow replies to comments, Direct messages and stories, checks followers, collects phone numbers — while you focus on the business.',
  'land.cta': 'Create a free account', 'land.cta2': 'See how it works',
  'land.trust': 'Official Meta API · No password needed',
  'land.f.title': 'Everything you need to sell in Direct',
  'land.f1.t': 'Visual flow builder', 'land.f1.d': 'Drag blocks, connect them with lines — build any conversation in minutes.',
  'land.f2.t': 'Comment → Direct', 'land.f2.d': 'Someone writes “price” under a post — they instantly get a reply and a DM with buttons.',
  'land.f3.t': 'Follow check', 'land.f3.d': 'Give the gift link only to followers. Everyone else is asked to follow first.',
  'land.f4.t': 'Lead collection', 'land.f4.d': 'Ask for a phone or email right in the chat and save it to contacts.',
  'land.f5.t': 'Stories', 'land.f5.d': 'Reply automatically to story replies and mentions.',
  'land.f6.t': 'Analytics', 'land.f6.d': 'See sends and button clicks on every block of the flow.',
  'land.how.title': 'Launch in 3 steps',
  'land.how1.t': 'Connect Instagram', 'land.how1.d': 'Log in with your business or creator account in one click.',
  'land.how2.t': 'Build a flow', 'land.how2.d': 'Start from a template or from scratch in the visual builder.',
  'land.how3.t': 'Turn it on', 'land.how3.d': 'ChatFlow answers 24/7 and collects leads for you.',
  'land.band.t': 'Ready to automate your Instagram?', 'land.band.d': 'Set up your first flow in 5 minutes.',
  'land.demo.comment': 'price?', 'land.demo.reply': 'Sent you a DM 📩', 'land.demo.dm': 'Hi! Prices and catalog below 👇',

  // auth
  'auth.login.title': 'Welcome back', 'auth.login.sub': 'Log in to your ChatFlow account',
  'auth.register.title': 'Create an account', 'auth.register.sub': 'Free start, no card required',
  'auth.name': 'Your name', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.password_hint': 'At least 8 characters',
  'auth.login.btn': 'Log in', 'auth.register.btn': 'Create account',
  'auth.no_account': 'No account yet?', 'auth.have_account': 'Already have an account?',
  'err.email_invalid': 'Enter a valid email', 'err.password_short': 'Password must be at least 8 characters',
  'err.email_taken': 'This email is already registered', 'err.login_failed': 'Wrong email or password',
  'err.password_wrong': 'Current password is wrong',

  // menyu
  'nav.home': 'Home', 'nav.flows': 'Flows', 'nav.contacts': 'Contacts', 'nav.activity': 'Activity',
  'nav.accounts': 'Accounts', 'nav.settings': 'Settings', 'nav.logout': 'Log out', 'nav.no_account': 'No account',

  // bosh sahifa
  'home.hello': 'Hi, {name}!', 'home.hello_anon': 'Hi!', 'home.sub': 'Here is what is happening with your Instagram',
  'home.stat.sent': 'Messages · 24 h', 'home.stat.contacts': 'Contacts', 'home.stat.flows': 'Active flows', 'home.stat.runs': 'Flow runs',
  'home.stat.new7': '+{n} this week',
  'home.templates': 'Start from a template', 'home.recent': 'Recent flows', 'home.all_flows': 'All flows',
  'home.onb.title': 'Connect your Instagram', 'home.onb.sub': 'It takes a minute. You need a Business or Creator account.',
  'home.onb.s1': 'Switch Instagram to a professional account', 'home.onb.s2': 'Allow access to messages in Instagram settings',
  'home.onb.s3': 'Click the button and confirm access',
  'home.onb.btn': 'Connect Instagram',

  // ssenariylar ro'yxati
  'flows.title': 'Flows', 'flows.sub': 'Automatic conversations triggered by comments, DMs and stories',
  'flows.new': 'New flow', 'flows.empty.t': 'No flows yet', 'flows.empty.d': 'Create your first flow from a template — it takes a minute.',
  'flows.runs': 'runs', 'flows.blocks': 'blocks', 'flows.updated': 'updated {t}',
  'flows.modal.title': 'New flow', 'flows.modal.blank': 'Blank flow', 'flows.modal.blank_d': 'Start from scratch in the builder',
  'flows.any_text': 'any text', 'flows.mention': 'story mention',

  // trigger turlari
  'trig.comment': 'Comment', 'trig.dm': 'Direct message', 'trig.story_reply': 'Story reply', 'trig.story_mention': 'Story mention',
  'trig.comment_d': 'Someone comments on a post or reel', 'trig.dm_d': 'Someone writes to Direct',
  'trig.story_reply_d': 'Someone replies to your story', 'trig.story_mention_d': 'Someone mentions you in a story',

  // muharrir
  'ed.add_block': 'Blocks', 'ed.saved': 'All changes saved', 'ed.unsaved': 'Unsaved', 'ed.errors': '{n} to fix',
  'ed.activate': 'Active', 'ed.fix_first': 'Fix the highlighted blocks before turning the flow on',
  'ed.activated': 'Flow is live 🎉', 'ed.paused': 'Flow paused', 'ed.name_ph': 'Flow name',
  'ed.select_hint': 'Select a block to edit it', 'ed.drop_hint': 'Drag a block onto the canvas or click it',
  'ed.connect_menu': 'Add next block', 'ed.desktop': 'The builder works best on a larger screen',
  'ed.fit': 'Fit to screen', 'ed.zoom_in': 'Zoom in', 'ed.zoom_out': 'Zoom out', 'ed.delete_block': 'Delete block',
  'ed.stats.sent': 'sent', 'ed.stats.runs': 'started', 'ed.stats.answered': 'answered', 'ed.stats.clicks': 'clicks',

  // bloklar
  'node.trigger': 'Trigger', 'node.message': 'Message', 'node.question': 'Question', 'node.condition': 'Condition',
  'node.action': 'Action', 'node.delay': 'Delay',
  'node.trigger_d': 'What starts the flow', 'node.message_d': 'Text with buttons', 'node.question_d': 'Ask and save the answer',
  'node.condition_d': 'Yes / No branch', 'node.action_d': 'Tags and fields', 'node.delay_d': 'Wait before next step',
  'node.empty_text': 'Empty message…', 'node.yes': 'Yes', 'node.no': 'No', 'node.next': 'Next',

  // inspektor
  'insp.when': 'When', 'insp.keywords': 'Keywords', 'insp.keywords_hint': 'Comma separated. Case does not matter.',
  'insp.match': 'Match', 'insp.match.contains': 'Text contains a keyword', 'insp.match.exact': 'Text equals a keyword',
  'insp.match.any': 'Any text',
  'insp.post': 'Post', 'insp.post_any': 'All posts and reels', 'insp.post_loading': 'Loading posts…',
  'insp.comment_replies': 'Public reply to the comment', 'insp.comment_replies_hint': 'Optional. One variant per line — a random one is used.',
  'insp.text': 'Text', 'insp.vars': 'Insert:', 'insp.buttons': 'Buttons', 'insp.buttons_hint': 'Up to 3. Title up to 20 characters.',
  'insp.btn_title': 'Button title', 'insp.btn_kind.flow': 'Next step', 'insp.btn_kind.url': 'Link',
  'insp.add_button': 'Add button',
  'insp.flow_btn_hint': 'Connect the dot next to the button to the next block.',
  'insp.q_field': 'Save answer to', 'insp.field.phone': 'Phone', 'insp.field.email': 'Email', 'insp.field.name': 'Name',
  'insp.field.custom': 'Custom field', 'insp.custom_key': 'Field key (latin, e.g. city)',
  'insp.validate': 'Check the answer', 'insp.validate.any': 'Any text', 'insp.validate.phone': 'Phone number',
  'insp.validate.email': 'Email', 'insp.validate.number': 'Number',
  'insp.error_text': 'If the answer is wrong, reply', 'insp.error_text_ph': 'Please send a valid phone number',
  'insp.check': 'Check', 'insp.check.follows': 'Follows my account', 'insp.check.has_tag': 'Has tag', 'insp.check.has_field': 'Field is filled',
  'insp.tag': 'Tag', 'insp.field': 'Field', 'insp.value': 'Value',
  'insp.op': 'Action', 'insp.op.add_tag': 'Add tag', 'insp.op.remove_tag': 'Remove tag', 'insp.op.set_field': 'Set field',
  'insp.wait': 'Wait', 'insp.minutes': 'minutes', 'insp.hours': 'hours',
  'insp.delay_note': 'Instagram allows messages within 24 hours after the person last wrote. Max delay is 23 hours.',
  'insp.follow_note': 'Works after the person taps a button or writes to you — Instagram does not share this earlier.',
  'insp.comment_note': 'After a comment Instagram allows only ONE message until the person replies or taps a button. Put a button in the first message.',

  // xatolar (validatsiya)
  've.trigger_keywords': 'Add at least one keyword', 've.trigger_kind': 'Choose a trigger', 've.trigger_match': 'Choose a match type',
  've.message_text': 'Message text is empty', 've.message_text_long': 'Text is too long (640 with buttons, 1000 without)',
  've.message_buttons_max': 'Maximum 3 buttons', 've.button_title': 'Button title: 1–20 characters',
  've.button_url': 'Link must start with https://', 've.question_text': 'Question text is empty',
  've.question_field': 'Set a field key (latin letters)', 've.condition_check': 'Choose what to check',
  've.condition_tag': 'Enter a tag', 've.condition_field': 'Enter a field key', 've.action_op': 'Choose an action',
  've.action_tag': 'Enter a tag', 've.action_field': 'Enter a field key', 've.delay_range': 'From 1 minute to 23 hours',
  've.trigger_count': 'A flow needs exactly one trigger', 've.bad_edge': 'Broken connection', 've.bad_node': 'Unknown block',
  've.bad_graph': 'Broken flow', 've.too_many_nodes': 'Too many blocks',

  // kontaktlar
  'ct.title': 'Contacts', 'ct.sub': 'People who interacted with your account', 'ct.search': 'Search by name, username, phone…',
  'ct.all_tags': 'All tags', 'ct.user': 'Contact', 'ct.phone': 'Phone', 'ct.email': 'Email', 'ct.tags': 'Tags',
  'ct.last_seen': 'Last activity', 'ct.follows': 'Follows', 'ct.total': '{n} contacts', 'ct.fields': 'Fields',
  'ct.add_tag': 'Add tag…', 'ct.empty.t': 'No contacts yet', 'ct.empty.d': 'They appear here when people comment or write to you.',
  'ct.first_seen': 'First seen', 'ct.prev': 'Back', 'ct.next': 'Next',

  // faollik
  'act.title': 'Activity', 'act.sub': 'Last 200 events',
  'act.kind.comment_reply': 'Comment reply', 'act.kind.private_reply': 'Direct (from comment)', 'act.kind.dm_reply': 'Direct',
  'act.kind.click': 'Button click', 'act.kind.answer': 'Answer saved', 'act.kind.skipped': 'Skipped', 'act.kind.error': 'Error',
  'act.skip.wait_user': 'Instagram: waiting for the person to reply or tap a button',
  'act.skip.limit': 'Hourly limit reached', 'act.skip.answer_attempts': 'Too many wrong answers',

  // akkauntlar
  'acc.title': 'Instagram accounts', 'acc.sub': 'Connect Business or Creator accounts',
  'acc.connect': 'Connect account', 'acc.connected': '@{u} connected!', 'acc.error': 'Could not connect: {e}',
  'acc.token': 'Access valid until {d}', 'acc.disconnect': 'Disconnect', 'acc.pause': 'Pause', 'acc.resume': 'Resume',
  'acc.disconnect_q': 'Disconnect @{u}? Its flows and contacts will be deleted.',
  'acc.req.title': 'Requirements', 'acc.req1': 'Business or Creator Instagram account',
  'acc.req2': 'Instagram → Settings → Messages → Connected tools → “Allow access to messages” is on',
  'acc.not_configured': 'The server is not configured yet (IG_APP_ID / IG_APP_SECRET).',

  // sozlamalar
  'set.title': 'Settings', 'set.profile': 'Profile', 'set.language': 'Language', 'set.password': 'Change password',
  'set.current_pw': 'Current password', 'set.new_pw': 'New password', 'set.saved': 'Settings saved',
}

type Dict = Record<keyof typeof en, string>

const ru: Dict = {
  'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.delete': 'Удалить', 'common.edit': 'Изменить',
  'common.open': 'Открыть', 'common.duplicate': 'Дублировать', 'common.close': 'Закрыть', 'common.search': 'Поиск',
  'common.loading': 'Загрузка…', 'common.saved': 'Сохранено', 'common.saving': 'Сохранение…', 'common.error': 'Что-то пошло не так',
  'common.confirm_delete': 'Удалить навсегда?', 'common.back': 'Назад', 'common.add': 'Добавить', 'common.active': 'Активен',
  'common.paused': 'На паузе', 'common.draft': 'Черновик', 'common.all': 'Все', 'common.yes': 'Да', 'common.no': 'Нет',
  'common.export': 'Экспорт CSV', 'common.empty': 'Здесь пока пусто',
  'time.now': 'только что', 'time.min': '{n} мин назад', 'time.hour': '{n} ч назад', 'time.day': '{n} дн назад',

  'land.nav.features': 'Возможности', 'land.nav.how': 'Как это работает', 'land.login': 'Войти', 'land.start': 'Начать бесплатно',
  'land.badge': 'Автоматизация Instagram',
  'land.title1': 'Превращайте комментарии', 'land.title2': 'в клиентов', 'land.title3': 'на автопилоте',
  'land.sub': 'ChatFlow отвечает на комментарии, сообщения в Direct и сторис, проверяет подписку, собирает телефоны — пока вы занимаетесь бизнесом.',
  'land.cta': 'Создать аккаунт бесплатно', 'land.cta2': 'Как это работает',
  'land.trust': 'Официальный API Meta · Пароль не нужен',
  'land.f.title': 'Всё, чтобы продавать в Direct',
  'land.f1.t': 'Визуальный конструктор', 'land.f1.d': 'Перетаскивайте блоки, соединяйте линиями — любой диалог за минуты.',
  'land.f2.t': 'Комментарий → Direct', 'land.f2.d': 'Пишут «цена» под постом — сразу получают ответ и сообщение с кнопками.',
  'land.f3.t': 'Проверка подписки', 'land.f3.d': 'Ссылка на подарок — только подписчикам. Остальных попросим подписаться.',
  'land.f4.t': 'Сбор лидов', 'land.f4.d': 'Спрашивайте телефон или email прямо в чате и сохраняйте в контакты.',
  'land.f5.t': 'Сторис', 'land.f5.d': 'Автоответ на ответы и упоминания в сторис.',
  'land.f6.t': 'Аналитика', 'land.f6.d': 'Отправки и клики по кнопкам на каждом блоке сценария.',
  'land.how.title': 'Запуск за 3 шага',
  'land.how1.t': 'Подключите Instagram', 'land.how1.d': 'Вход бизнес- или авторским аккаунтом в один клик.',
  'land.how2.t': 'Соберите сценарий', 'land.how2.d': 'Из шаблона или с нуля в визуальном конструкторе.',
  'land.how3.t': 'Включите', 'land.how3.d': 'ChatFlow отвечает 24/7 и собирает заявки за вас.',
  'land.band.t': 'Готовы автоматизировать Instagram?', 'land.band.d': 'Первый сценарий — за 5 минут.',
  'land.demo.comment': 'цена?', 'land.demo.reply': 'Написали вам в Direct 📩', 'land.demo.dm': 'Привет! Цены и каталог ниже 👇',

  'auth.login.title': 'С возвращением', 'auth.login.sub': 'Войдите в аккаунт ChatFlow',
  'auth.register.title': 'Создайте аккаунт', 'auth.register.sub': 'Бесплатный старт, без карты',
  'auth.name': 'Ваше имя', 'auth.email': 'Email', 'auth.password': 'Пароль', 'auth.password_hint': 'Минимум 8 символов',
  'auth.login.btn': 'Войти', 'auth.register.btn': 'Создать аккаунт',
  'auth.no_account': 'Ещё нет аккаунта?', 'auth.have_account': 'Уже есть аккаунт?',
  'err.email_invalid': 'Введите корректный email', 'err.password_short': 'Пароль — минимум 8 символов',
  'err.email_taken': 'Этот email уже зарегистрирован', 'err.login_failed': 'Неверный email или пароль',
  'err.password_wrong': 'Текущий пароль неверный',

  'nav.home': 'Главная', 'nav.flows': 'Сценарии', 'nav.contacts': 'Контакты', 'nav.activity': 'Активность',
  'nav.accounts': 'Аккаунты', 'nav.settings': 'Настройки', 'nav.logout': 'Выйти', 'nav.no_account': 'Нет аккаунта',

  'home.hello': 'Привет, {name}!', 'home.hello_anon': 'Привет!', 'home.sub': 'Что происходит в вашем Instagram',
  'home.stat.sent': 'Сообщений · 24 ч', 'home.stat.contacts': 'Контакты', 'home.stat.flows': 'Активные сценарии', 'home.stat.runs': 'Запуски',
  'home.stat.new7': '+{n} за неделю',
  'home.templates': 'Начните с шаблона', 'home.recent': 'Последние сценарии', 'home.all_flows': 'Все сценарии',
  'home.onb.title': 'Подключите Instagram', 'home.onb.sub': 'Это займёт минуту. Нужен бизнес- или авторский аккаунт.',
  'home.onb.s1': 'Переключите Instagram на профессиональный аккаунт', 'home.onb.s2': 'Разрешите доступ к сообщениям в настройках Instagram',
  'home.onb.s3': 'Нажмите кнопку и подтвердите доступ',
  'home.onb.btn': 'Подключить Instagram',

  'flows.title': 'Сценарии', 'flows.sub': 'Автоматические диалоги на комментарии, Direct и сторис',
  'flows.new': 'Новый сценарий', 'flows.empty.t': 'Сценариев пока нет', 'flows.empty.d': 'Создайте первый сценарий из шаблона — это займёт минуту.',
  'flows.runs': 'запусков', 'flows.blocks': 'блоков', 'flows.updated': 'изменён {t}',
  'flows.modal.title': 'Новый сценарий', 'flows.modal.blank': 'Пустой сценарий', 'flows.modal.blank_d': 'С нуля в конструкторе',
  'flows.any_text': 'любой текст', 'flows.mention': 'упоминание в сторис',

  'trig.comment': 'Комментарий', 'trig.dm': 'Сообщение в Direct', 'trig.story_reply': 'Ответ на сторис', 'trig.story_mention': 'Упоминание в сторис',
  'trig.comment_d': 'Комментарий под постом или Reels', 'trig.dm_d': 'Человек пишет в Direct',
  'trig.story_reply_d': 'Ответ на вашу сторис', 'trig.story_mention_d': 'Вас отметили в сторис',

  'ed.add_block': 'Блоки', 'ed.saved': 'Все изменения сохранены', 'ed.unsaved': 'Не сохранено', 'ed.errors': 'исправить: {n}',
  'ed.activate': 'Активен', 'ed.fix_first': 'Исправьте выделенные блоки, прежде чем включать сценарий',
  'ed.activated': 'Сценарий запущен 🎉', 'ed.paused': 'Сценарий на паузе', 'ed.name_ph': 'Название сценария',
  'ed.select_hint': 'Выберите блок, чтобы изменить его', 'ed.drop_hint': 'Перетащите блок на холст или нажмите на него',
  'ed.connect_menu': 'Добавить следующий блок', 'ed.desktop': 'Конструктор удобнее на большом экране',
  'ed.fit': 'Показать всё', 'ed.zoom_in': 'Приблизить', 'ed.zoom_out': 'Отдалить', 'ed.delete_block': 'Удалить блок',
  'ed.stats.sent': 'отправлено', 'ed.stats.runs': 'запусков', 'ed.stats.answered': 'ответили', 'ed.stats.clicks': 'кликов',

  'node.trigger': 'Триггер', 'node.message': 'Сообщение', 'node.question': 'Вопрос', 'node.condition': 'Условие',
  'node.action': 'Действие', 'node.delay': 'Пауза',
  'node.trigger_d': 'Что запускает сценарий', 'node.message_d': 'Текст с кнопками', 'node.question_d': 'Спросить и сохранить ответ',
  'node.condition_d': 'Ветка Да / Нет', 'node.action_d': 'Теги и поля', 'node.delay_d': 'Подождать перед шагом',
  'node.empty_text': 'Пустое сообщение…', 'node.yes': 'Да', 'node.no': 'Нет', 'node.next': 'Далее',

  'insp.when': 'Когда', 'insp.keywords': 'Ключевые слова', 'insp.keywords_hint': 'Через запятую. Регистр не важен.',
  'insp.match': 'Совпадение', 'insp.match.contains': 'Текст содержит слово', 'insp.match.exact': 'Текст равен слову',
  'insp.match.any': 'Любой текст',
  'insp.post': 'Пост', 'insp.post_any': 'Все посты и Reels', 'insp.post_loading': 'Загрузка постов…',
  'insp.comment_replies': 'Публичный ответ на комментарий', 'insp.comment_replies_hint': 'Необязательно. Один вариант в строке — выбирается случайный.',
  'insp.text': 'Текст', 'insp.vars': 'Вставить:', 'insp.buttons': 'Кнопки', 'insp.buttons_hint': 'До 3. Название до 20 символов.',
  'insp.btn_title': 'Название кнопки', 'insp.btn_kind.flow': 'Следующий шаг', 'insp.btn_kind.url': 'Ссылка',
  'insp.add_button': 'Добавить кнопку',
  'insp.flow_btn_hint': 'Соедините точку справа от кнопки со следующим блоком.',
  'insp.q_field': 'Сохранить ответ в', 'insp.field.phone': 'Телефон', 'insp.field.email': 'Email', 'insp.field.name': 'Имя',
  'insp.field.custom': 'Своё поле', 'insp.custom_key': 'Ключ поля (латиницей, напр. city)',
  'insp.validate': 'Проверять ответ', 'insp.validate.any': 'Любой текст', 'insp.validate.phone': 'Номер телефона',
  'insp.validate.email': 'Email', 'insp.validate.number': 'Число',
  'insp.error_text': 'Если ответ неверный, написать', 'insp.error_text_ph': 'Пожалуйста, отправьте корректный номер',
  'insp.check': 'Проверить', 'insp.check.follows': 'Подписан на мой аккаунт', 'insp.check.has_tag': 'Есть тег', 'insp.check.has_field': 'Поле заполнено',
  'insp.tag': 'Тег', 'insp.field': 'Поле', 'insp.value': 'Значение',
  'insp.op': 'Действие', 'insp.op.add_tag': 'Добавить тег', 'insp.op.remove_tag': 'Убрать тег', 'insp.op.set_field': 'Заполнить поле',
  'insp.wait': 'Ждать', 'insp.minutes': 'минут', 'insp.hours': 'часов',
  'insp.delay_note': 'Instagram разрешает писать в течение 24 часов после последнего сообщения человека. Максимум — 23 часа.',
  'insp.follow_note': 'Работает после того, как человек нажал кнопку или написал вам — раньше Instagram не даёт эти данные.',
  'insp.comment_note': 'После комментария Instagram разрешает только ОДНО сообщение, пока человек не ответит или не нажмёт кнопку. Добавьте кнопку в первое сообщение.',

  've.trigger_keywords': 'Добавьте хотя бы одно ключевое слово', 've.trigger_kind': 'Выберите триггер', 've.trigger_match': 'Выберите тип совпадения',
  've.message_text': 'Текст сообщения пуст', 've.message_text_long': 'Слишком длинный текст (640 с кнопками, 1000 без)',
  've.message_buttons_max': 'Максимум 3 кнопки', 've.button_title': 'Название кнопки: 1–20 символов',
  've.button_url': 'Ссылка должна начинаться с https://', 've.question_text': 'Текст вопроса пуст',
  've.question_field': 'Укажите ключ поля (латиницей)', 've.condition_check': 'Выберите, что проверять',
  've.condition_tag': 'Укажите тег', 've.condition_field': 'Укажите ключ поля', 've.action_op': 'Выберите действие',
  've.action_tag': 'Укажите тег', 've.action_field': 'Укажите ключ поля', 've.delay_range': 'От 1 минуты до 23 часов',
  've.trigger_count': 'В сценарии должен быть ровно один триггер', 've.bad_edge': 'Ошибка соединения', 've.bad_node': 'Неизвестный блок',
  've.bad_graph': 'Сценарий повреждён', 've.too_many_nodes': 'Слишком много блоков',

  'ct.title': 'Контакты', 'ct.sub': 'Люди, которые взаимодействовали с аккаунтом', 'ct.search': 'Поиск по имени, username, телефону…',
  'ct.all_tags': 'Все теги', 'ct.user': 'Контакт', 'ct.phone': 'Телефон', 'ct.email': 'Email', 'ct.tags': 'Теги',
  'ct.last_seen': 'Активность', 'ct.follows': 'Подписан', 'ct.total': 'Контактов: {n}', 'ct.fields': 'Поля',
  'ct.add_tag': 'Добавить тег…', 'ct.empty.t': 'Контактов пока нет', 'ct.empty.d': 'Они появятся, когда вам напишут или оставят комментарий.',
  'ct.first_seen': 'Впервые', 'ct.prev': 'Назад', 'ct.next': 'Далее',

  'act.title': 'Активность', 'act.sub': 'Последние 200 событий',
  'act.kind.comment_reply': 'Ответ на комментарий', 'act.kind.private_reply': 'Direct (из комментария)', 'act.kind.dm_reply': 'Direct',
  'act.kind.click': 'Нажатие кнопки', 'act.kind.answer': 'Ответ сохранён', 'act.kind.skipped': 'Пропущено', 'act.kind.error': 'Ошибка',
  'act.skip.wait_user': 'Instagram: ждём, пока человек ответит или нажмёт кнопку',
  'act.skip.limit': 'Достигнут лимит в час', 'act.skip.answer_attempts': 'Слишком много неверных ответов',

  'acc.title': 'Аккаунты Instagram', 'acc.sub': 'Подключайте бизнес- или авторские аккаунты',
  'acc.connect': 'Подключить аккаунт', 'acc.connected': '@{u} подключён!', 'acc.error': 'Не удалось подключить: {e}',
  'acc.token': 'Доступ действует до {d}', 'acc.disconnect': 'Отключить', 'acc.pause': 'Пауза', 'acc.resume': 'Возобновить',
  'acc.disconnect_q': 'Отключить @{u}? Его сценарии и контакты будут удалены.',
  'acc.req.title': 'Требования', 'acc.req1': 'Бизнес- или авторский аккаунт Instagram',
  'acc.req2': 'Instagram → Настройки → Сообщения → Подключённые инструменты → «Разрешить доступ к сообщениям»',
  'acc.not_configured': 'Сервер ещё не настроен (IG_APP_ID / IG_APP_SECRET).',

  'set.title': 'Настройки', 'set.profile': 'Профиль', 'set.language': 'Язык', 'set.password': 'Сменить пароль',
  'set.current_pw': 'Текущий пароль', 'set.new_pw': 'Новый пароль', 'set.saved': 'Настройки сохранены',
}

const uz: Dict = {
  'common.save': 'Saqlash', 'common.cancel': 'Bekor qilish', 'common.delete': "O'chirish", 'common.edit': 'Tahrirlash',
  'common.open': 'Ochish', 'common.duplicate': 'Nusxa olish', 'common.close': 'Yopish', 'common.search': 'Qidirish',
  'common.loading': 'Yuklanmoqda…', 'common.saved': 'Saqlandi', 'common.saving': 'Saqlanmoqda…', 'common.error': 'Xatolik yuz berdi',
  'common.confirm_delete': "Butunlay o'chirilsinmi?", 'common.back': 'Orqaga', 'common.add': "Qo'shish", 'common.active': 'Faol',
  'common.paused': "To'xtatilgan", 'common.draft': 'Qoralama', 'common.all': 'Hammasi', 'common.yes': 'Ha', 'common.no': "Yo'q",
  'common.export': 'CSV eksport', 'common.empty': "Hozircha bo'sh",
  'time.now': 'hozirgina', 'time.min': '{n} daq oldin', 'time.hour': '{n} soat oldin', 'time.day': '{n} kun oldin',

  'land.nav.features': 'Imkoniyatlar', 'land.nav.how': 'Qanday ishlaydi', 'land.login': 'Kirish', 'land.start': 'Bepul boshlash',
  'land.badge': 'Instagram avtomatlashtirish',
  'land.title1': 'Izohlarni', 'land.title2': 'mijozga', 'land.title3': 'avtomatik aylantiring',
  'land.sub': "ChatFlow izohlar, Direct xabarlar va story'larga javob beradi, obunani tekshiradi, telefon raqamlarni yig'adi — siz esa biznes bilan shug'ullanasiz.",
  'land.cta': 'Bepul hisob ochish', 'land.cta2': 'Qanday ishlaydi',
  'land.trust': "Rasmiy Meta API · Parol so'ralmaydi",
  'land.f.title': "Direct'da sotish uchun hamma narsa",
  'land.f1.t': 'Vizual ssenariy quruvchi', 'land.f1.d': "Bloklarni torting, chiziq bilan ulang — istalgan suhbatni bir necha daqiqada quring.",
  'land.f2.t': 'Izoh → Direct', 'land.f2.d': "Post ostiga «narx» deb yozishsa — darhol javob va tugmali Direct xabar oladi.",
  'land.f3.t': 'Obuna tekshiruvi', 'land.f3.d': "Sovg'a havolasi faqat obunachilarga. Qolganlardan obuna bo'lish so'raladi.",
  'land.f4.t': "Lid yig'ish", 'land.f4.d': "Chatning o'zida telefon yoki email so'rang va kontaktlarga saqlang.",
  'land.f5.t': 'Story', 'land.f5.d': "Story'ga javob va belgilashlarga avtomatik javob.",
  'land.f6.t': 'Statistika', 'land.f6.d': "Ssenariyning har bir blokida yuborishlar va tugma bosishlar.",
  'land.how.title': '3 qadamda ishga tushiring',
  'land.how1.t': 'Instagram ulang', 'land.how1.d': 'Biznes yoki creator akkaunt bilan bir bosishda kiring.',
  'land.how2.t': 'Ssenariy tuzing', 'land.how2.d': 'Shablondan yoki noldan vizual quruvchida.',
  'land.how3.t': 'Yoqing', 'land.how3.d': "ChatFlow 24/7 javob beradi va siz uchun lid yig'adi.",
  'land.band.t': 'Instagramni avtomatlashtirishga tayyormisiz?', 'land.band.d': 'Birinchi ssenariy — 5 daqiqada.',
  'land.demo.comment': 'narxi?', 'land.demo.reply': "Direct'ga yozdik 📩", 'land.demo.dm': 'Salom! Narxlar va katalog quyida 👇',

  'auth.login.title': 'Xush kelibsiz', 'auth.login.sub': 'ChatFlow hisobingizga kiring',
  'auth.register.title': 'Hisob yarating', 'auth.register.sub': 'Bepul boshlang, karta kerak emas',
  'auth.name': 'Ismingiz', 'auth.email': 'Email', 'auth.password': 'Parol', 'auth.password_hint': 'Kamida 8 belgi',
  'auth.login.btn': 'Kirish', 'auth.register.btn': 'Hisob yaratish',
  'auth.no_account': "Hisobingiz yo'qmi?", 'auth.have_account': 'Hisobingiz bormi?',
  'err.email_invalid': "To'g'ri email kiriting", 'err.password_short': 'Parol kamida 8 belgi',
  'err.email_taken': "Bu email ro'yxatdan o'tgan", 'err.login_failed': "Email yoki parol noto'g'ri",
  'err.password_wrong': "Joriy parol noto'g'ri",

  'nav.home': 'Bosh sahifa', 'nav.flows': 'Ssenariylar', 'nav.contacts': 'Kontaktlar', 'nav.activity': 'Faollik',
  'nav.accounts': 'Akkauntlar', 'nav.settings': 'Sozlamalar', 'nav.logout': 'Chiqish', 'nav.no_account': "Akkaunt yo'q",

  'home.hello': 'Salom, {name}!', 'home.hello_anon': 'Salom!', 'home.sub': "Instagramingizda nimalar bo'lyapti",
  'home.stat.sent': 'Xabarlar · 24 soat', 'home.stat.contacts': 'Kontaktlar', 'home.stat.flows': 'Faol ssenariylar', 'home.stat.runs': 'Ishga tushishlar',
  'home.stat.new7': '+{n} shu hafta',
  'home.templates': 'Shablondan boshlang', 'home.recent': "So'nggi ssenariylar", 'home.all_flows': 'Barcha ssenariylar',
  'home.onb.title': 'Instagram ulang', 'home.onb.sub': 'Bir daqiqa vaqt oladi. Business yoki Creator akkaunt kerak.',
  'home.onb.s1': "Instagramni professional akkauntga o'tkazing", 'home.onb.s2': "Instagram sozlamalarida xabarlarga ruxsat bering",
  'home.onb.s3': 'Tugmani bosing va ruxsatni tasdiqlang',
  'home.onb.btn': 'Instagram ulash',

  'flows.title': 'Ssenariylar', 'flows.sub': "Izoh, Direct va story'ga avtomatik suhbatlar",
  'flows.new': 'Yangi ssenariy', 'flows.empty.t': "Hali ssenariy yo'q", 'flows.empty.d': 'Birinchi ssenariyni shablondan yarating — bir daqiqa kifoya.',
  'flows.runs': 'marta', 'flows.blocks': 'blok', 'flows.updated': "o'zgartirildi {t}",
  'flows.modal.title': 'Yangi ssenariy', 'flows.modal.blank': "Bo'sh ssenariy", 'flows.modal.blank_d': 'Quruvchida noldan boshlash',
  'flows.any_text': 'har qanday matn', 'flows.mention': 'story belgilash',

  'trig.comment': 'Izoh', 'trig.dm': 'Direct xabar', 'trig.story_reply': "Story'ga javob", 'trig.story_mention': "Story'da belgilash",
  'trig.comment_d': 'Post yoki Reels ostiga izoh', 'trig.dm_d': "Kimdir Direct'ga yozadi",
  'trig.story_reply_d': "Story'ingizga javob", 'trig.story_mention_d': "Sizni story'da belgilashdi",

  'ed.add_block': 'Bloklar', 'ed.saved': "Barcha o'zgarishlar saqlandi", 'ed.unsaved': 'Saqlanmagan', 'ed.errors': 'tuzatish: {n}',
  'ed.activate': 'Faol', 'ed.fix_first': 'Ssenariyni yoqishdan oldin belgilangan bloklarni tuzating',
  'ed.activated': 'Ssenariy ishga tushdi 🎉', 'ed.paused': "Ssenariy to'xtatildi", 'ed.name_ph': 'Ssenariy nomi',
  'ed.select_hint': 'Tahrirlash uchun blokni tanlang', 'ed.drop_hint': 'Blokni maydonga torting yoki bosing',
  'ed.connect_menu': "Keyingi blokni qo'shish", 'ed.desktop': 'Quruvchi katta ekranda qulayroq',
  'ed.fit': "Hammasini ko'rsatish", 'ed.zoom_in': 'Yaqinlashtirish', 'ed.zoom_out': 'Uzoqlashtirish', 'ed.delete_block': "Blokni o'chirish",
  'ed.stats.sent': 'yuborildi', 'ed.stats.runs': 'ishga tushdi', 'ed.stats.answered': 'javob berdi', 'ed.stats.clicks': 'bosildi',

  'node.trigger': 'Trigger', 'node.message': 'Xabar', 'node.question': 'Savol', 'node.condition': 'Shart',
  'node.action': 'Amal', 'node.delay': 'Kutish',
  'node.trigger_d': 'Ssenariyni nima boshlaydi', 'node.message_d': 'Tugmali matn', 'node.question_d': "So'rash va javobni saqlash",
  'node.condition_d': "Ha / Yo'q tarmog'i", 'node.action_d': 'Teglar va maydonlar', 'node.delay_d': 'Keyingi qadamdan oldin kutish',
  'node.empty_text': "Bo'sh xabar…", 'node.yes': 'Ha', 'node.no': "Yo'q", 'node.next': 'Keyin',

  'insp.when': 'Qachon', 'insp.keywords': "Kalit so'zlar", 'insp.keywords_hint': 'Vergul bilan. Katta-kichik harf farqi yo‘q.',
  'insp.match': 'Moslik', 'insp.match.contains': "Matnda kalit so'z bo'lsa", 'insp.match.exact': "Matn aynan kalit so'z",
  'insp.match.any': 'Har qanday matn',
  'insp.post': 'Post', 'insp.post_any': 'Barcha post va Reels', 'insp.post_loading': 'Postlar yuklanmoqda…',
  'insp.comment_replies': 'Izohga ochiq javob', 'insp.comment_replies_hint': 'Ixtiyoriy. Har qatorda bitta variant — tasodifiy tanlanadi.',
  'insp.text': 'Matn', 'insp.vars': "Qo'yish:", 'insp.buttons': 'Tugmalar', 'insp.buttons_hint': '3 tagacha. Nomi 20 belgigacha.',
  'insp.btn_title': 'Tugma nomi', 'insp.btn_kind.flow': 'Keyingi qadam', 'insp.btn_kind.url': 'Havola',
  'insp.add_button': "Tugma qo'shish",
  'insp.flow_btn_hint': "Tugma yonidagi nuqtani keyingi blokka ulang.",
  'insp.q_field': 'Javobni saqlash', 'insp.field.phone': 'Telefon', 'insp.field.email': 'Email', 'insp.field.name': 'Ism',
  'insp.field.custom': "O'z maydoni", 'insp.custom_key': 'Maydon kaliti (lotincha, masalan city)',
  'insp.validate': 'Javobni tekshirish', 'insp.validate.any': 'Har qanday matn', 'insp.validate.phone': 'Telefon raqam',
  'insp.validate.email': 'Email', 'insp.validate.number': 'Raqam',
  'insp.error_text': "Javob noto'g'ri bo'lsa, yozish", 'insp.error_text_ph': "Iltimos, to'g'ri raqam yuboring",
  'insp.check': 'Tekshirish', 'insp.check.follows': "Akkauntimga obuna bo'lgan", 'insp.check.has_tag': 'Tegi bor', 'insp.check.has_field': "Maydon to'ldirilgan",
  'insp.tag': 'Teg', 'insp.field': 'Maydon', 'insp.value': 'Qiymat',
  'insp.op': 'Amal', 'insp.op.add_tag': "Teg qo'shish", 'insp.op.remove_tag': 'Tegni olib tashlash', 'insp.op.set_field': "Maydonni to'ldirish",
  'insp.wait': 'Kutish', 'insp.minutes': 'daqiqa', 'insp.hours': 'soat',
  'insp.delay_note': "Instagram odam oxirgi yozgandan keyin 24 soat ichida xabar yuborishga ruxsat beradi. Eng ko'pi — 23 soat.",
  'insp.follow_note': 'Odam tugmani bosgan yoki sizga yozgandan keyin ishlaydi — Instagram bu ma’lumotni oldinroq bermaydi.',
  'insp.comment_note': "Izohdan keyin Instagram odam javob bermaguncha yoki tugma bosmaguncha faqat BITTA xabarga ruxsat beradi. Birinchi xabarga tugma qo'ying.",

  've.trigger_keywords': "Kamida bitta kalit so'z qo'shing", 've.trigger_kind': 'Triggerni tanlang', 've.trigger_match': 'Moslik turini tanlang',
  've.message_text': "Xabar matni bo'sh", 've.message_text_long': 'Matn juda uzun (tugmali 640, tugmasiz 1000)',
  've.message_buttons_max': "Ko'pi bilan 3 ta tugma", 've.button_title': 'Tugma nomi: 1–20 belgi',
  've.button_url': 'Havola https:// bilan boshlansin', 've.question_text': "Savol matni bo'sh",
  've.question_field': 'Maydon kalitini kiriting (lotincha)', 've.condition_check': 'Nimani tekshirishni tanlang',
  've.condition_tag': 'Tegni kiriting', 've.condition_field': 'Maydon kalitini kiriting', 've.action_op': 'Amalni tanlang',
  've.action_tag': 'Tegni kiriting', 've.action_field': 'Maydon kalitini kiriting', 've.delay_range': '1 daqiqadan 23 soatgacha',
  've.trigger_count': "Ssenariyda bitta trigger bo'lishi kerak", 've.bad_edge': 'Ulanish xatosi', 've.bad_node': "Noma'lum blok",
  've.bad_graph': 'Ssenariy buzilgan', 've.too_many_nodes': "Bloklar juda ko'p",

  'ct.title': 'Kontaktlar', 'ct.sub': "Akkauntingiz bilan muloqot qilgan odamlar", 'ct.search': "Ism, username, telefon bo'yicha qidirish…",
  'ct.all_tags': 'Barcha teglar', 'ct.user': 'Kontakt', 'ct.phone': 'Telefon', 'ct.email': 'Email', 'ct.tags': 'Teglar',
  'ct.last_seen': 'Faollik', 'ct.follows': 'Obunachi', 'ct.total': '{n} ta kontakt', 'ct.fields': 'Maydonlar',
  'ct.add_tag': "Teg qo'shish…", 'ct.empty.t': "Hali kontakt yo'q", 'ct.empty.d': 'Sizga yozishsa yoki izoh qoldirishsa, shu yerda paydo bo‘ladi.',
  'ct.first_seen': 'Birinchi marta', 'ct.prev': 'Oldingi', 'ct.next': 'Keyingi',

  'act.title': 'Faollik', 'act.sub': "So'nggi 200 ta hodisa",
  'act.kind.comment_reply': 'Izohga javob', 'act.kind.private_reply': 'Direct (izohdan)', 'act.kind.dm_reply': 'Direct',
  'act.kind.click': 'Tugma bosildi', 'act.kind.answer': 'Javob saqlandi', 'act.kind.skipped': "O'tkazildi", 'act.kind.error': 'Xato',
  'act.skip.wait_user': 'Instagram: odam javob berishi yoki tugma bosishi kutilmoqda',
  'act.skip.limit': 'Soatlik limitga yetildi', 'act.skip.answer_attempts': "Noto'g'ri javoblar juda ko'p",

  'acc.title': 'Instagram akkauntlar', 'acc.sub': 'Business yoki Creator akkauntlarni ulang',
  'acc.connect': 'Akkaunt ulash', 'acc.connected': '@{u} ulandi!', 'acc.error': 'Ulanmadi: {e}',
  'acc.token': 'Ruxsat {d} gacha amal qiladi', 'acc.disconnect': 'Uzish', 'acc.pause': "To'xtatish", 'acc.resume': 'Davom ettirish',
  'acc.disconnect_q': "@{u} uzilsinmi? Uning ssenariy va kontaktlari o'chiriladi.",
  'acc.req.title': 'Talablar', 'acc.req1': 'Business yoki Creator Instagram akkaunt',
  'acc.req2': 'Instagram → Sozlamalar → Xabarlar → Ulangan vositalar → «Xabarlarga ruxsat berish» yoqilgan',
  'acc.not_configured': 'Server hali sozlanmagan (IG_APP_ID / IG_APP_SECRET).',

  'set.title': 'Sozlamalar', 'set.profile': 'Profil', 'set.language': 'Til', 'set.password': "Parolni o'zgartirish",
  'set.current_pw': 'Joriy parol', 'set.new_pw': 'Yangi parol', 'set.saved': 'Sozlamalar saqlandi',
}

const tj: Dict = {
  'common.save': 'Нигоҳ доштан', 'common.cancel': 'Бекор кардан', 'common.delete': 'Нест кардан', 'common.edit': 'Таҳрир',
  'common.open': 'Кушодан', 'common.duplicate': 'Нусха гирифтан', 'common.close': 'Пӯшидан', 'common.search': 'Ҷустуҷӯ',
  'common.loading': 'Боргирӣ…', 'common.saved': 'Нигоҳ дошта шуд', 'common.saving': 'Нигоҳдорӣ…', 'common.error': 'Хатое рух дод',
  'common.confirm_delete': 'Тамоман нест карда шавад?', 'common.back': 'Бозгашт', 'common.add': 'Илова', 'common.active': 'Фаъол',
  'common.paused': 'Боздошта', 'common.draft': 'Сиёҳнавис', 'common.all': 'Ҳама', 'common.yes': 'Ҳа', 'common.no': 'Не',
  'common.export': 'Содироти CSV', 'common.empty': 'Ҳоло холӣ аст',
  'time.now': 'ҳозир', 'time.min': '{n} дақ пеш', 'time.hour': '{n} соат пеш', 'time.day': '{n} рӯз пеш',

  'land.nav.features': 'Имкониятҳо', 'land.nav.how': 'Чӣ тавр кор мекунад', 'land.login': 'Ворид шудан', 'land.start': 'Ройгон оғоз кунед',
  'land.badge': 'Автоматикунонии Instagram',
  'land.title1': 'Шарҳҳоро ба', 'land.title2': 'мизоҷон', 'land.title3': 'худкор табдил диҳед',
  'land.sub': 'ChatFlow ба шарҳҳо, паёмҳои Direct ва сторисҳо ҷавоб медиҳад, обунаро месанҷад, рақамҳои телефонро ҷамъ мекунад — шумо бошад ба тиҷорат машғул шавед.',
  'land.cta': 'Ҳисоби ройгон кушоед', 'land.cta2': 'Чӣ тавр кор мекунад',
  'land.trust': 'API-и расмии Meta · Парол лозим нест',
  'land.f.title': 'Ҳама чиз барои фурӯш дар Direct',
  'land.f1.t': 'Сохтори визуалии сенария', 'land.f1.d': 'Блокҳоро кашед, бо хат пайваст кунед — ҳар гуна суҳбатро дар чанд дақиқа созед.',
  'land.f2.t': 'Шарҳ → Direct', 'land.f2.d': 'Зери пост «нарх» нависанд — фавран ҷавоб ва паём бо тугмаҳо мегиранд.',
  'land.f3.t': 'Санҷиши обуна', 'land.f3.d': 'Ҳаволаи тӯҳфа танҳо ба обуначиён. Аз дигарон хоҳиш мекунем, ки обуна шаванд.',
  'land.f4.t': 'Ҷамъоварии лидҳо', 'land.f4.d': 'Рақами телефон ё email-ро дар худи чат пурсед ва дар контактҳо нигоҳ доред.',
  'land.f5.t': 'Сторис', 'land.f5.d': 'Ҷавоби худкор ба ҷавобҳо ва ёдоварӣ дар сторис.',
  'land.f6.t': 'Таҳлил', 'land.f6.d': 'Фиристодан ва пахши тугмаҳо дар ҳар блоки сенария.',
  'land.how.title': 'Дар 3 қадам оғоз кунед',
  'land.how1.t': 'Instagram-ро пайваст кунед', 'land.how1.d': 'Бо аккаунти тиҷоратӣ ё муаллифӣ бо як клик ворид шавед.',
  'land.how2.t': 'Сенария созед', 'land.how2.d': 'Аз қолиб ё аз сифр дар сохтори визуалӣ.',
  'land.how3.t': 'Фаъол кунед', 'land.how3.d': 'ChatFlow 24/7 ҷавоб медиҳад ва барои шумо дархостҳо ҷамъ мекунад.',
  'land.band.t': 'Барои автоматикунонии Instagram омодаед?', 'land.band.d': 'Сенарияи аввал — дар 5 дақиқа.',
  'land.demo.comment': 'нархаш?', 'land.demo.reply': 'Ба Direct навиштем 📩', 'land.demo.dm': 'Салом! Нархҳо ва каталог дар зер 👇',

  'auth.login.title': 'Хуш омадед', 'auth.login.sub': 'Ба ҳисоби ChatFlow ворид шавед',
  'auth.register.title': 'Ҳисоб созед', 'auth.register.sub': 'Оғози ройгон, корт лозим нест',
  'auth.name': 'Номи шумо', 'auth.email': 'Email', 'auth.password': 'Парол', 'auth.password_hint': 'Ҳадди ақал 8 аломат',
  'auth.login.btn': 'Ворид шудан', 'auth.register.btn': 'Ҳисоб сохтан',
  'auth.no_account': 'Ҳисоб надоред?', 'auth.have_account': 'Ҳисоб доред?',
  'err.email_invalid': 'Email-и дуруст ворид кунед', 'err.password_short': 'Парол ҳадди ақал 8 аломат',
  'err.email_taken': 'Ин email аллакай сабт шудааст', 'err.login_failed': 'Email ё парол нодуруст',
  'err.password_wrong': 'Пароли ҷорӣ нодуруст',

  'nav.home': 'Асосӣ', 'nav.flows': 'Сенарияҳо', 'nav.contacts': 'Контактҳо', 'nav.activity': 'Фаъолият',
  'nav.accounts': 'Аккаунтҳо', 'nav.settings': 'Танзимот', 'nav.logout': 'Баромадан', 'nav.no_account': 'Аккаунт нест',

  'home.hello': 'Салом, {name}!', 'home.hello_anon': 'Салом!', 'home.sub': 'Дар Instagram-и шумо чӣ мегузарад',
  'home.stat.sent': 'Паёмҳо · 24 соат', 'home.stat.contacts': 'Контактҳо', 'home.stat.flows': 'Сенарияҳои фаъол', 'home.stat.runs': 'Оғозҳо',
  'home.stat.new7': '+{n} дар ин ҳафта',
  'home.templates': 'Аз қолиб оғоз кунед', 'home.recent': 'Сенарияҳои охирин', 'home.all_flows': 'Ҳамаи сенарияҳо',
  'home.onb.title': 'Instagram-ро пайваст кунед', 'home.onb.sub': 'Як дақиқа вақт мегирад. Аккаунти Business ё Creator лозим аст.',
  'home.onb.s1': 'Instagram-ро ба аккаунти касбӣ гузаронед', 'home.onb.s2': 'Дар танзимоти Instagram ба паёмҳо иҷозат диҳед',
  'home.onb.s3': 'Тугмаро пахш кунед ва дастрасиро тасдиқ кунед',
  'home.onb.btn': 'Пайваст кардани Instagram',

  'flows.title': 'Сенарияҳо', 'flows.sub': 'Суҳбатҳои худкор ба шарҳ, Direct ва сторис',
  'flows.new': 'Сенарияи нав', 'flows.empty.t': 'Ҳоло сенария нест', 'flows.empty.d': 'Сенарияи аввалро аз қолиб созед — як дақиқа кифоя аст.',
  'flows.runs': 'оғоз', 'flows.blocks': 'блок', 'flows.updated': 'тағйир {t}',
  'flows.modal.title': 'Сенарияи нав', 'flows.modal.blank': 'Сенарияи холӣ', 'flows.modal.blank_d': 'Аз сифр дар сохтор',
  'flows.any_text': 'ҳар матн', 'flows.mention': 'ёдоварӣ дар сторис',

  'trig.comment': 'Шарҳ', 'trig.dm': 'Паёми Direct', 'trig.story_reply': 'Ҷавоб ба сторис', 'trig.story_mention': 'Ёдоварӣ дар сторис',
  'trig.comment_d': 'Шарҳ зери пост ё Reels', 'trig.dm_d': 'Касе ба Direct менависад',
  'trig.story_reply_d': 'Ҷавоб ба сториси шумо', 'trig.story_mention_d': 'Шуморо дар сторис қайд карданд',

  'ed.add_block': 'Блокҳо', 'ed.saved': 'Ҳамаи тағйирот нигоҳ дошта шуд', 'ed.unsaved': 'Нигоҳ дошта нашуд', 'ed.errors': 'ислоҳ: {n}',
  'ed.activate': 'Фаъол', 'ed.fix_first': 'Пеш аз фаъол кардан блокҳои ишорашударо ислоҳ кунед',
  'ed.activated': 'Сенария оғоз шуд 🎉', 'ed.paused': 'Сенария боздошта шуд', 'ed.name_ph': 'Номи сенария',
  'ed.select_hint': 'Барои таҳрир блокро интихоб кунед', 'ed.drop_hint': 'Блокро ба майдон кашед ё пахш кунед',
  'ed.connect_menu': 'Блоки навбатиро илова кунед', 'ed.desktop': 'Сохтор дар экрани калон қулайтар аст',
  'ed.fit': 'Ҳамаро нишон додан', 'ed.zoom_in': 'Наздик кардан', 'ed.zoom_out': 'Дур кардан', 'ed.delete_block': 'Нест кардани блок',
  'ed.stats.sent': 'фиристода', 'ed.stats.runs': 'оғоз', 'ed.stats.answered': 'ҷавоб доданд', 'ed.stats.clicks': 'пахш',

  'node.trigger': 'Триггер', 'node.message': 'Паём', 'node.question': 'Савол', 'node.condition': 'Шарт',
  'node.action': 'Амал', 'node.delay': 'Интизорӣ',
  'node.trigger_d': 'Сенарияро чӣ оғоз мекунад', 'node.message_d': 'Матн бо тугмаҳо', 'node.question_d': 'Пурсидан ва нигоҳ доштани ҷавоб',
  'node.condition_d': 'Шохаи Ҳа / Не', 'node.action_d': 'Барчаспҳо ва майдонҳо', 'node.delay_d': 'Пеш аз қадами навбатӣ интизор шудан',
  'node.empty_text': 'Паёми холӣ…', 'node.yes': 'Ҳа', 'node.no': 'Не', 'node.next': 'Баъд',

  'insp.when': 'Кай', 'insp.keywords': 'Калимаҳои калидӣ', 'insp.keywords_hint': 'Бо вергул. Ҳарфи калон ё хурд фарқ надорад.',
  'insp.match': 'Мувофиқат', 'insp.match.contains': 'Матн калимаро дорад', 'insp.match.exact': 'Матн айнан калима аст',
  'insp.match.any': 'Ҳар матн',
  'insp.post': 'Пост', 'insp.post_any': 'Ҳамаи постҳо ва Reels', 'insp.post_loading': 'Постҳо бор мешаванд…',
  'insp.comment_replies': 'Ҷавоби кушод ба шарҳ', 'insp.comment_replies_hint': 'Ихтиёрӣ. Дар ҳар сатр як вариант — тасодуфӣ интихоб мешавад.',
  'insp.text': 'Матн', 'insp.vars': 'Гузоштан:', 'insp.buttons': 'Тугмаҳо', 'insp.buttons_hint': 'То 3. Ном то 20 аломат.',
  'insp.btn_title': 'Номи тугма', 'insp.btn_kind.flow': 'Қадами навбатӣ', 'insp.btn_kind.url': 'Ҳавола',
  'insp.add_button': 'Илова кардани тугма',
  'insp.flow_btn_hint': 'Нуқтаи паҳлӯи тугмаро ба блоки навбатӣ пайваст кунед.',
  'insp.q_field': 'Ҷавобро нигоҳ доштан дар', 'insp.field.phone': 'Телефон', 'insp.field.email': 'Email', 'insp.field.name': 'Ном',
  'insp.field.custom': 'Майдони худ', 'insp.custom_key': 'Калиди майдон (лотинӣ, масалан city)',
  'insp.validate': 'Санҷиши ҷавоб', 'insp.validate.any': 'Ҳар матн', 'insp.validate.phone': 'Рақами телефон',
  'insp.validate.email': 'Email', 'insp.validate.number': 'Рақам',
  'insp.error_text': 'Агар ҷавоб нодуруст бошад, нависед', 'insp.error_text_ph': 'Лутфан рақами дурустро фиристед',
  'insp.check': 'Санҷидан', 'insp.check.follows': 'Ба аккаунти ман обуна аст', 'insp.check.has_tag': 'Барчасп дорад', 'insp.check.has_field': 'Майдон пур аст',
  'insp.tag': 'Барчасп', 'insp.field': 'Майдон', 'insp.value': 'Қимат',
  'insp.op': 'Амал', 'insp.op.add_tag': 'Илова кардани барчасп', 'insp.op.remove_tag': 'Хориҷ кардани барчасп', 'insp.op.set_field': 'Пур кардани майдон',
  'insp.wait': 'Интизор шудан', 'insp.minutes': 'дақиқа', 'insp.hours': 'соат',
  'insp.delay_note': 'Instagram дар давоми 24 соат пас аз паёми охирини шахс навиштанро иҷозат медиҳад. Ҳадди аксар — 23 соат.',
  'insp.follow_note': 'Пас аз он кор мекунад, ки шахс тугмаро пахш кунад ё ба шумо нависад — Instagram ин маълумотро пештар намедиҳад.',
  'insp.comment_note': 'Пас аз шарҳ Instagram то ҷавоб ё пахши тугма танҳо ЯК паёмро иҷозат медиҳад. Ба паёми аввал тугма гузоред.',

  've.trigger_keywords': 'Ҳадди ақал як калимаи калидӣ илова кунед', 've.trigger_kind': 'Триггерро интихоб кунед', 've.trigger_match': 'Навъи мувофиқатро интихоб кунед',
  've.message_text': 'Матни паём холӣ аст', 've.message_text_long': 'Матн хеле дароз аст (бо тугма 640, бе тугма 1000)',
  've.message_buttons_max': 'Ҳадди аксар 3 тугма', 've.button_title': 'Номи тугма: 1–20 аломат',
  've.button_url': 'Ҳавола бояд бо https:// оғоз шавад', 've.question_text': 'Матни савол холӣ аст',
  've.question_field': 'Калиди майдонро нависед (лотинӣ)', 've.condition_check': 'Чиро санҷиданро интихоб кунед',
  've.condition_tag': 'Барчаспро нависед', 've.condition_field': 'Калиди майдонро нависед', 've.action_op': 'Амалро интихоб кунед',
  've.action_tag': 'Барчаспро нависед', 've.action_field': 'Калиди майдонро нависед', 've.delay_range': 'Аз 1 дақиқа то 23 соат',
  've.trigger_count': 'Дар сенария бояд маҳз як триггер бошад', 've.bad_edge': 'Хатои пайвастшавӣ', 've.bad_node': 'Блоки номаълум',
  've.bad_graph': 'Сенария вайрон аст', 've.too_many_nodes': 'Блокҳо хеле зиёданд',

  'ct.title': 'Контактҳо', 'ct.sub': 'Одамоне, ки бо аккаунти шумо муошират карданд', 'ct.search': 'Ҷустуҷӯ аз рӯи ном, username, телефон…',
  'ct.all_tags': 'Ҳамаи барчаспҳо', 'ct.user': 'Контакт', 'ct.phone': 'Телефон', 'ct.email': 'Email', 'ct.tags': 'Барчаспҳо',
  'ct.last_seen': 'Фаъолият', 'ct.follows': 'Обуначӣ', 'ct.total': '{n} контакт', 'ct.fields': 'Майдонҳо',
  'ct.add_tag': 'Илова кардани барчасп…', 'ct.empty.t': 'Ҳоло контакт нест', 'ct.empty.d': 'Вақте ба шумо нависанд ё шарҳ гузоранд, дар ин ҷо пайдо мешаванд.',
  'ct.first_seen': 'Бори аввал', 'ct.prev': 'Қаблӣ', 'ct.next': 'Навбатӣ',

  'act.title': 'Фаъолият', 'act.sub': '200 ҳодисаи охирин',
  'act.kind.comment_reply': 'Ҷавоб ба шарҳ', 'act.kind.private_reply': 'Direct (аз шарҳ)', 'act.kind.dm_reply': 'Direct',
  'act.kind.click': 'Пахши тугма', 'act.kind.answer': 'Ҷавоб нигоҳ дошта шуд', 'act.kind.skipped': 'Гузаронида шуд', 'act.kind.error': 'Хато',
  'act.skip.wait_user': 'Instagram: интизори ҷавоб ё пахши тугма',
  'act.skip.limit': 'Ба маҳдудияти соатона расид', 'act.skip.answer_attempts': 'Ҷавобҳои нодуруст хеле зиёд',

  'acc.title': 'Аккаунтҳои Instagram', 'acc.sub': 'Аккаунтҳои Business ё Creator-ро пайваст кунед',
  'acc.connect': 'Пайваст кардани аккаунт', 'acc.connected': '@{u} пайваст шуд!', 'acc.error': 'Пайваст нашуд: {e}',
  'acc.token': 'Дастрасӣ то {d} эътибор дорад', 'acc.disconnect': 'Ҷудо кардан', 'acc.pause': 'Боздоштан', 'acc.resume': 'Идома додан',
  'acc.disconnect_q': '@{u} ҷудо карда шавад? Сенарияҳо ва контактҳои он нест мешаванд.',
  'acc.req.title': 'Талабот', 'acc.req1': 'Аккаунти Business ё Creator дар Instagram',
  'acc.req2': 'Instagram → Танзимот → Паёмҳо → Абзорҳои пайвастшуда → «Иҷозати дастрасӣ ба паёмҳо» фаъол',
  'acc.not_configured': 'Сервер ҳоло танзим нашудааст (IG_APP_ID / IG_APP_SECRET).',

  'set.title': 'Танзимот', 'set.profile': 'Профил', 'set.language': 'Забон', 'set.password': 'Иваз кардани парол',
  'set.current_pw': 'Пароли ҷорӣ', 'set.new_pw': 'Пароли нав', 'set.saved': 'Танзимот нигоҳ дошта шуд',
}

const DICTS: Record<Lang, Dict> = { en, ru, uz, tj }
export type TKey = keyof typeof en

function detect(): Lang {
  try {
    const saved = localStorage.getItem('cf_lang') as Lang | null
    if (saved && saved in DICTS) return saved
  } catch { /* storage yo'q */ }
  const nav = (navigator.language || 'ru').toLowerCase()
  if (nav.startsWith('tg') || nav.startsWith('tj')) return 'tj'
  if (nav.startsWith('uz')) return 'uz'
  if (nav.startsWith('en')) return 'en'
  return 'ru'
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey, vars?: Record<string, string | number>) => string }
const I18nCtx = createContext<Ctx>(null as unknown as Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect)
  useEffect(() => { document.documentElement.lang = lang === 'tj' ? 'tg' : lang }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('cf_lang', l) } catch { /* ignore */ }
  }, [])
  const t = useCallback((k: TKey, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][k] ?? en[k] ?? k
    if (vars) for (const [name, v] of Object.entries(vars)) s = s.replaceAll(`{${name}}`, String(v))
    return s
  }, [lang])
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>
}

export const useI18n = () => useContext(I18nCtx)

export function useTimeAgo() {
  const { t } = useI18n()
  return (iso?: string | null) => {
    if (!iso) return '—'
    const s = (Date.now() - new Date(iso).getTime()) / 1000
    if (s < 60) return t('time.now')
    if (s < 3600) return t('time.min', { n: Math.floor(s / 60) })
    if (s < 86400) return t('time.hour', { n: Math.floor(s / 3600) })
    return t('time.day', { n: Math.floor(s / 86400) })
  }
}
