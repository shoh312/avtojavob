import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, BadgeCheck, Bot, Check, CircleDot, Gift, GraduationCap, Instagram, Loader2, Megaphone,
  MessageCircle, MoreHorizontal, PartyPopper, Phone, Scissors, ShoppingBag, Sparkles, Tag, UserRound, Workflow,
  type LucideIcon,
} from 'lucide-react'
import { api, type FlowSummary, type Template } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { Logo } from '../components/Logo'
import { LangSwitch, Toggle, useToast } from '../components/ui'
import { useTemplates } from '../components/NewFlowModal'

/* ------------------------------------------------------------------ matnlar (4 til) */

const TX = {
  ru: {
    skip_all: 'Пропустить настройку', back: 'Назад', next: 'Продолжить', skip: 'Пропустить', later: 'Сделаю позже',
    steps: ['О бизнесе', 'Instagram', 'AI-продавец', 'Первый сценарий'],
    hello: (n: string) => `Привет${n ? `, ${n}` : ''}! 👋`,
    biz_t: 'Расскажите о вашем бизнесе', biz_d: 'Так мы подберём шаблоны и настроим AI под вас. Займёт 2 минуты.',
    biz_q: 'Чем вы занимаетесь?', goals_q: 'Что хотите автоматизировать?', goals_h: 'Можно выбрать несколько',
    biz: { courses: ['Обучение и курсы', 'Учебный центр, школа, репетитор'], shop: ['Магазин', 'Одежда, косметика, товары'], services: ['Услуги', 'Салон, клиника, ремонт'], other: ['Другое', 'Блогер, агентство, ресторан…'] },
    goals: { comments: 'Ответы на комментарии', sales: 'Продажи в Direct', leads: 'Сбор заявок и телефонов', broadcasts: 'Рассылки клиентам' },
    ig_t: 'Подключите Instagram', ig_d: 'ChatFlow работает через официальный API Meta — пароль от Instagram не нужен.',
    ig_req: ['Профессиональный аккаунт (Бизнес или Автор)', 'Вход через окно Instagram — 30 секунд', 'Отключить можно в любой момент'],
    ig_btn: 'Подключить Instagram', ig_ok: 'Аккаунт подключён', ig_err: 'Не удалось подключить', ig_na: 'Подключение Instagram пока не настроено на сервере.',
    ai_t: 'Научите AI-продавца', ai_d: 'Он будет отвечать клиентам в Direct 24/7: называть цены, отвечать на вопросы и собирать телефоны.',
    ai_lbl: 'Опишите бизнес своими словами', ai_tip: 'Что продаёте, цены, адрес, график работы, доставка — чем подробнее, тем точнее ответы.',
    ai_on: 'Включить AI-продавца', ai_on_d: 'Можно выключить в любой момент в «Интеграциях»', ai_noacc: 'Описание сохранится и применится, когда вы подключите Instagram.',
    ai_ph: {
      courses: 'Мы — учебный центр «…» в Душанбе. Курсы: английский (450 сомони/мес), IT (600 сомони/мес). Занятия 3 раза в неделю, группы до 10 человек. Адрес: … Работаем с 9:00 до 19:00.',
      shop: 'Магазин женской одежды «…». Платья от 250 сомони, костюмы от 400. Доставка по Душанбе — 20 сомони, по Таджикистану 2–3 дня. Оплата наличными или картой.',
      services: 'Салон красоты «…». Маникюр — 120 сомони, стрижка — от 80, окрашивание — от 300. Запись через Direct. Адрес: … Работаем ежедневно 10:00–20:00.',
      other: 'Чем вы занимаетесь, что предлагаете клиентам, цены, как с вами связаться…',
    },
    flow_t: 'Запустите первый сценарий', flow_d: 'Готовый шаблон — его можно поменять в конструкторе. Мы отметили подходящий для вас.',
    flow_rec: 'Рекомендуем', flow_noacc: 'Сценарии работают с подключённым Instagram. Вы сможете выбрать шаблон позже в разделе «Сценарии».',
    flow_btn: 'Создать сценарий',
    done_t: 'Всё готово! 🎉', done_d: 'ChatFlow настроен. Вот что уже сделано:',
    done_items: { biz: 'Профиль бизнеса заполнен', ig: 'Instagram подключён', ai: 'AI-продавец обучен', flow: 'Первый сценарий создан' },
    done_next: 'Что дальше', done_tips: ['Проверьте сценарий кнопкой «Тест»', 'Подключите Telegram, чтобы получать заявки', 'Добавьте товары — AI будет присылать карточки'],
    go: 'Перейти в панель', open_flow: 'Открыть сценарий', trial: 'У вас 7 дней бесплатного доступа ко всем функциям',
  },
  uz: {
    skip_all: "Sozlashni o'tkazib yuborish", back: 'Orqaga', next: 'Davom etish', skip: "O'tkazib yuborish", later: 'Keyinroq qilaman',
    steps: ['Biznes haqida', 'Instagram', 'AI sotuvchi', 'Birinchi ssenariy'],
    hello: (n: string) => `Salom${n ? `, ${n}` : ''}! 👋`,
    biz_t: 'Biznesingiz haqida aytib bering', biz_d: "Shunga qarab shablonlarni tanlaymiz va AI'ni sozlaymiz. 2 daqiqa vaqt oladi.",
    biz_q: 'Nima bilan shug\'ullanasiz?', goals_q: 'Nimani avtomatlashtirmoqchisiz?', goals_h: 'Bir nechtasini tanlash mumkin',
    biz: { courses: ["Ta'lim va kurslar", "O'quv markaz, maktab, repetitor"], shop: ["Do'kon", 'Kiyim, kosmetika, tovarlar'], services: ['Xizmatlar', "Salon, klinika, ta'mir"], other: ['Boshqa', 'Bloger, agentlik, restoran…'] },
    goals: { comments: 'Kommentlarga javob', sales: "Direct'da sotuv", leads: "Ariza va raqam yig'ish", broadcasts: 'Mijozlarga rassilka' },
    ig_t: "Instagram'ni ulang", ig_d: 'ChatFlow Meta rasmiy API orqali ishlaydi — Instagram paroli kerak emas.',
    ig_req: ['Professional akkaunt (Biznes yoki Avtor)', 'Instagram oynasi orqali kirish — 30 soniya', "Istalgan vaqtda uzib qo'yish mumkin"],
    ig_btn: "Instagram'ni ulash", ig_ok: 'Akkaunt ulandi', ig_err: "Ulab bo'lmadi", ig_na: 'Serverda Instagram ulanishi hali sozlanmagan.',
    ai_t: "AI sotuvchini o'rgating", ai_d: "U Direct'da mijozlarga 24/7 javob beradi: narxlarni aytadi, savollarga javob beradi va raqamlarni yig'adi.",
    ai_lbl: "Biznesingizni o'z so'zlaringiz bilan tasvirlang", ai_tip: "Nima sotasiz, narxlar, manzil, ish vaqti, yetkazib berish — qancha batafsil bo'lsa, javoblar shuncha aniq.",
    ai_on: 'AI sotuvchini yoqish', ai_on_d: "«Integratsiyalar»da istalgan vaqtda o'chirish mumkin", ai_noacc: "Tavsif saqlanadi va Instagram'ni ulaganingizda qo'llanadi.",
    ai_ph: {
      courses: "Biz Toshkentdagi «…» o'quv markazimiz. Kurslar: ingliz tili (oyiga 450 000 so'm), IT (oyiga 600 000 so'm). Haftada 3 marta, guruhda 10 kishigacha. Manzil: … Ish vaqti 9:00–19:00.",
      shop: "«…» ayollar kiyimi do'koni. Ko'ylaklar 250 000 so'mdan, kostyumlar 400 000 dan. Shahar bo'ylab yetkazish — 20 000 so'm, viloyatlarga 2–3 kun. Naqd yoki karta.",
      services: "«…» go'zallik saloni. Manikyur — 120 000 so'm, soch olish — 80 000 dan. Direct orqali yozilish. Manzil: … Har kuni 10:00–20:00.",
      other: 'Nima bilan shug\'ullanasiz, mijozlarga nima taklif qilasiz, narxlar, qanday bog\'lanish mumkin…',
    },
    flow_t: 'Birinchi ssenariyni ishga tushiring', flow_d: "Tayyor shablon — konstruktorda o'zgartirish mumkin. Sizga mosini belgiladik.",
    flow_rec: 'Tavsiya', flow_noacc: "Ssenariylar ulangan Instagram bilan ishlaydi. Shablonni keyin «Ssenariylar» bo'limida tanlaysiz.",
    flow_btn: 'Ssenariy yaratish',
    done_t: 'Hammasi tayyor! 🎉', done_d: 'ChatFlow sozlandi. Mana nimalar qilindi:',
    done_items: { biz: "Biznes profili to'ldirildi", ig: 'Instagram ulandi', ai: "AI sotuvchi o'rgatildi", flow: 'Birinchi ssenariy yaratildi' },
    done_next: 'Keyingi qadamlar', done_tips: ['Ssenariyni «Test» tugmasi bilan tekshiring', "Arizalarni olish uchun Telegram'ni ulang", "Tovarlar qo'shing — AI kartochkalarni yuboradi"],
    go: "Panelga o'tish", open_flow: 'Ssenariyni ochish', trial: "Barcha funksiyalardan 7 kun bepul foydalanasiz",
  },
  tj: {
    skip_all: 'Гузаштан аз танзим', back: 'Бозгашт', next: 'Идома', skip: 'Гузаштан', later: 'Баъдтар',
    steps: ['Дар бораи бизнес', 'Instagram', 'AI-фурӯшанда', 'Сенарияи аввал'],
    hello: (n: string) => `Салом${n ? `, ${n}` : ''}! 👋`,
    biz_t: 'Дар бораи бизнеси худ нақл кунед', biz_d: 'Аз рӯи ин шаблонҳо интихоб ва AI танзим мешавад. 2 дақиқа вақт мегирад.',
    biz_q: 'Бо чӣ машғулед?', goals_q: 'Чиро автоматӣ кардан мехоҳед?', goals_h: 'Якчандтоашро интихоб кардан мумкин',
    biz: { courses: ['Таълим ва курсҳо', 'Маркази таълимӣ, мактаб, репетитор'], shop: ['Мағоза', 'Либос, косметика, мол'], services: ['Хизматрасонӣ', 'Салон, клиника, таъмир'], other: ['Дигар', 'Блогер, агентӣ, тарабхона…'] },
    goals: { comments: 'Ҷавоб ба шарҳҳо', sales: 'Фурӯш дар Direct', leads: 'Ҷамъ кардани дархостҳо', broadcasts: 'Паёмҳои оммавӣ' },
    ig_t: 'Instagram-ро пайваст кунед', ig_d: 'ChatFlow тавассути API-и расмии Meta кор мекунад — пароли Instagram лозим нест.',
    ig_req: ['Аккаунти касбӣ (Бизнес ё Муаллиф)', 'Воридшавӣ тавассути равзанаи Instagram — 30 сония', 'Ҳар вақт ҷудо кардан мумкин'],
    ig_btn: 'Пайваст кардани Instagram', ig_ok: 'Аккаунт пайваст шуд', ig_err: 'Пайваст нашуд', ig_na: 'Пайвасти Instagram дар сервер ҳоло танзим нашудааст.',
    ai_t: 'AI-фурӯшандаро омӯзонед', ai_d: 'Ӯ дар Direct ба мизоҷон 24/7 ҷавоб медиҳад: нархҳоро мегӯяд, ба саволҳо ҷавоб медиҳад ва рақамҳоро ҷамъ мекунад.',
    ai_lbl: 'Бизнеси худро бо суханони худ тасвир кунед', ai_tip: 'Чӣ мефурӯшед, нархҳо, суроға, вақти корӣ, расонидан — ҳар қадар муфассал, ҷавобҳо ҳамон қадар дақиқ.',
    ai_on: 'Фаъол кардани AI-фурӯшанда', ai_on_d: 'Дар «Интегратсияҳо» ҳар вақт хомӯш кардан мумкин', ai_noacc: 'Тавсиф нигоҳ дошта мешавад ва ҳангоми пайвасти Instagram истифода мешавад.',
    ai_ph: {
      courses: 'Мо маркази таълимии «…» дар Душанбе. Курсҳо: забони англисӣ (450 сомонӣ/моҳ), IT (600 сомонӣ/моҳ). Ҳафтае 3 маротиба, гурӯҳ то 10 нафар. Суроға: … Аз 9:00 то 19:00.',
      shop: 'Мағозаи либоси занонаи «…». Курта аз 250 сомонӣ, костюм аз 400. Расонидан дар Душанбе — 20 сомонӣ, ба вилоятҳо 2–3 рӯз. Пардохт нақд ё бо корт.',
      services: 'Салони зебоии «…». Маникюр — 120 сомонӣ, мӯйгирӣ — аз 80, рангкунӣ — аз 300. Сабт тавассути Direct. Суроға: … Ҳар рӯз 10:00–20:00.',
      other: 'Бо чӣ машғулед, ба мизоҷон чӣ пешниҳод мекунед, нархҳо, чӣ тавр тамос гирифтан…',
    },
    flow_t: 'Сенарияи аввалро оғоз кунед', flow_d: 'Шаблони тайёр — дар конструктор тағйир додан мумкин. Мувофиқашро қайд кардем.',
    flow_rec: 'Тавсия', flow_noacc: 'Сенарияҳо бо Instagram-и пайвастшуда кор мекунанд. Шаблонро баъдтар дар бахши «Сенарияҳо» интихоб мекунед.',
    flow_btn: 'Сохтани сенария',
    done_t: 'Ҳама тайёр! 🎉', done_d: 'ChatFlow танзим шуд. Инҳо иҷро шуданд:',
    done_items: { biz: 'Профили бизнес пур карда шуд', ig: 'Instagram пайваст шуд', ai: 'AI-фурӯшанда омӯзонида шуд', flow: 'Сенарияи аввал сохта шуд' },
    done_next: 'Қадамҳои навбатӣ', done_tips: ['Сенарияро бо тугмаи «Тест» санҷед', 'Барои гирифтани дархостҳо Telegram-ро пайваст кунед', 'Мол илова кунед — AI кортҳоро мефиристад'],
    go: 'Ба панел', open_flow: 'Кушодани сенария', trial: '7 рӯз ҳамаи имкониятҳо ройгон',
  },
  en: {
    skip_all: 'Skip setup', back: 'Back', next: 'Continue', skip: 'Skip', later: "I'll do it later",
    steps: ['Your business', 'Instagram', 'AI seller', 'First flow'],
    hello: (n: string) => `Hi${n ? `, ${n}` : ''}! 👋`,
    biz_t: 'Tell us about your business', biz_d: "We'll pick templates and tune the AI for you. Takes 2 minutes.",
    biz_q: 'What do you do?', goals_q: 'What do you want to automate?', goals_h: 'Pick as many as you like',
    biz: { courses: ['Education & courses', 'Learning center, school, tutor'], shop: ['Shop', 'Clothes, cosmetics, goods'], services: ['Services', 'Salon, clinic, repairs'], other: ['Other', 'Creator, agency, restaurant…'] },
    goals: { comments: 'Reply to comments', sales: 'Sell in Direct', leads: 'Collect leads & phones', broadcasts: 'Broadcasts' },
    ig_t: 'Connect Instagram', ig_d: "ChatFlow uses Meta's official API — we never ask for your Instagram password.",
    ig_req: ['Professional account (Business or Creator)', 'Log in through the Instagram window — 30 seconds', 'Disconnect any time'],
    ig_btn: 'Connect Instagram', ig_ok: 'Account connected', ig_err: 'Could not connect', ig_na: 'Instagram connection is not configured on the server yet.',
    ai_t: 'Teach your AI seller', ai_d: 'It answers customers in Direct 24/7: shares prices, answers questions and collects phone numbers.',
    ai_lbl: 'Describe your business in your own words', ai_tip: 'What you sell, prices, address, hours, delivery — the more detail, the better the answers.',
    ai_on: 'Turn on the AI seller', ai_on_d: 'You can turn it off any time in Integrations', ai_noacc: 'We will save this and apply it once you connect Instagram.',
    ai_ph: {
      courses: 'We are “…” learning center. Courses: English ($45/mo), IT ($60/mo). 3 classes a week, groups up to 10. Address: … Open 9:00–19:00.',
      shop: 'Women’s clothing store “…”. Dresses from $25, suits from $40. City delivery $2, nationwide 2–3 days. Cash or card.',
      services: 'Beauty salon “…”. Manicure $12, haircut from $8, coloring from $30. Book via Direct. Address: … Open daily 10:00–20:00.',
      other: 'What you do, what you offer, prices, how to reach you…',
    },
    flow_t: 'Launch your first flow', flow_d: 'A ready-made template you can edit in the builder. We marked the best fit for you.',
    flow_rec: 'Recommended', flow_noacc: 'Flows need a connected Instagram account. You can pick a template later in Flows.',
    flow_btn: 'Create flow',
    done_t: "You're all set! 🎉", done_d: "ChatFlow is ready. Here's what's done:",
    done_items: { biz: 'Business profile filled in', ig: 'Instagram connected', ai: 'AI seller trained', flow: 'First flow created' },
    done_next: "What's next", done_tips: ['Try your flow with the “Test” button', 'Connect Telegram to get leads', 'Add products — the AI will send product cards'],
    go: 'Go to dashboard', open_flow: 'Open flow', trial: 'You have 7 days of free access to everything',
  },
}

type Biz = 'courses' | 'shop' | 'services' | 'other'
type Goal = 'comments' | 'sales' | 'leads' | 'broadcasts'
type Step = 'biz' | 'instagram' | 'ai' | 'flow' | 'done'
const ORDER: Step[] = ['biz', 'instagram', 'ai', 'flow', 'done']

const BIZ_ICON: Record<Biz, LucideIcon> = { courses: GraduationCap, shop: ShoppingBag, services: Scissors, other: MoreHorizontal }
const GOAL_ICON: Record<Goal, LucideIcon> = { comments: MessageCircle, sales: Bot, leads: Phone, broadcasts: Megaphone }
const TPL_ICON: Record<string, LucideIcon> = { tag: Tag, gift: Gift, phone: Phone, 'circle-dot': CircleDot }

function recommended(goals: Goal[]): string {
  if (goals.includes('leads') && !goals.includes('comments')) return 'lead'
  if (goals.includes('broadcasts') && goals.length === 1) return 'gift'
  return 'price'
}

/* ------------------------------------------------------------------ sahifa */

export default function Welcome() {
  const { lang } = useI18n()
  const L = TX[(lang in TX ? lang : 'ru') as keyof typeof TX]
  const { me, account, refresh, setAccountId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const onb = me?.user.onboarding

  const [step, setStep] = useState<Step>(() => {
    if (params.get('connected')) return 'ai'
    if (params.get('ig_error')) return 'instagram'
    const s = params.get('step') as Step | null
    return s && ORDER.includes(s) ? s : 'biz'
  })
  const [biz, setBiz] = useState<Biz | ''>((onb?.biz as Biz) || '')
  const [goals, setGoals] = useState<Goal[]>((onb?.goals as Goal[]) || [])
  const [about, setAbout] = useState(onb?.about || '')
  const [aiOn, setAiOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [flow, setFlow] = useState<FlowSummary | null>(null)
  const [aiSaved, setAiSaved] = useState(false)
  const igError = params.get('ig_error')

  // Instagram'dan qaytganda — yangi akkauntni tanlash
  useEffect(() => {
    const u = params.get('connected')
    if (!u || !me) return
    const acc = me.accounts.find(a => a.username === u)
    if (acc) setAccountId(acc.id)
  }, [params, me, setAccountId])

  // akkaunt bor bo'lsa — mavjud AI tavsifini olish
  useEffect(() => {
    if (!account || about) return
    api.get<{ ai_prompt?: string }>(`/api/accounts/${account.id}/integrations`).then(r => { if (r.ai_prompt) setAbout(r.ai_prompt) }).catch(() => {})
  }, [account]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (s: Step) => {
    setStep(s)
    const p = new URLSearchParams()
    if (s !== 'biz') p.set('step', s)
    setParams(p, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const save = (o: Record<string, unknown>) => api.patch('/api/me', { onboarding: o }).catch(() => {})

  const finish = async (to = '/app') => {
    setBusy(true)
    await save({ done: true })
    await refresh()
    navigate(to, { replace: true })
  }

  if (!me) return null
  if (!onb) return <Navigate to="/app" replace />

  const idx = ORDER.indexOf(step)
  const name = (me.user.name || '').split(' ')[0]

  return (
    <div className="min-h-dvh bg-soft lg:grid lg:grid-cols-[340px_1fr]">
      {/* chap panel: qadamlar */}
      <aside className="relative hidden overflow-hidden bg-ink p-8 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand-600/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl" />
        <Logo size={30} light />
        <ol className="relative mt-16 space-y-1">
          {L.steps.map((s, i) => {
            const done = i < idx, cur = i === idx
            return (
              <li key={s} className={`flex items-center gap-3.5 rounded-2xl px-3 py-3 transition ${cur ? 'bg-white/10' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold transition ${done ? 'bg-brand-600 text-white' : cur ? 'bg-white text-ink' : 'border border-white/20 text-white/50'}`}>
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-[14.5px] font-semibold ${cur ? 'text-white' : done ? 'text-white/80' : 'text-white/45'}`}>{s}</span>
              </li>
            )
          })}
        </ol>
        <div className="relative mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-[13px] leading-relaxed text-white/70">
          <Gift className="mb-2 h-5 w-5 text-brand-400" />{L.trial}
        </div>
      </aside>

      {/* o'ng: kontent */}
      <main className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <span className="lg:hidden"><Logo size={26} /></span>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <LangSwitch />
            {step !== 'done' && <button onClick={() => finish()} className="whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-3 hover:bg-white hover:text-ink"><span className="sm:hidden">{L.skip}</span><span className="hidden sm:inline">{L.skip_all}</span></button>}
          </div>
        </header>

        {/* mobil progress */}
        {step !== 'done' && (
          <div className="px-4 sm:px-8 lg:hidden">
            <div className="flex gap-1.5">{L.steps.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full transition-all ${i <= idx ? 'bg-brand-600' : 'bg-line'}`} />)}</div>
            <div className="mt-2 text-[12px] font-semibold text-ink-3">{idx + 1}/{L.steps.length} · {L.steps[idx]}</div>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4 pb-10 pt-6 sm:px-8 lg:pt-10">
          <div key={step} className="animate-fade-up">
            {step === 'biz' && (
              <>
                <div className="text-[15px] font-semibold text-brand-600">{L.hello(name)}</div>
                <Title t={L.biz_t} d={L.biz_d} />
                <Label>{L.biz_q}</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(Object.keys(L.biz) as Biz[]).map(k => {
                    const Icon = BIZ_ICON[k], on = biz === k
                    return (
                      <button key={k} onClick={() => setBiz(k)}
                        className={`relative flex flex-col items-start rounded-2xl border-2 bg-white p-4 text-left transition ${on ? 'border-brand-600 shadow-[0_10px_30px_-14px_rgba(229,22,31,.5)]' : 'border-transparent ring-1 ring-line hover:ring-ink/20'}`}>
                        <span className={`grid h-10 w-10 place-items-center rounded-xl transition ${on ? 'bg-brand-600 text-white' : 'bg-soft text-ink-2'}`}><Icon className="h-5 w-5" /></span>
                        <span className="mt-3 text-[14.5px] font-bold leading-tight">{L.biz[k][0]}</span>
                        <span className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{L.biz[k][1]}</span>
                        {on && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>}
                      </button>
                    )
                  })}
                </div>
                <Label hint={L.goals_h}>{L.goals_q}</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(L.goals) as Goal[]).map(g => {
                    const Icon = GOAL_ICON[g], on = goals.includes(g)
                    return (
                      <button key={g} onClick={() => setGoals(x => on ? x.filter(y => y !== g) : [...x, g])}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-semibold transition ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-ink/30'}`}>
                        {on ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}{L.goals[g]}
                      </button>
                    )
                  })}
                </div>
                <Nav next={L.next} disabled={!biz} onNext={() => { save({ biz, goals }); go('instagram') }} />
              </>
            )}

            {step === 'instagram' && (
              <>
                <StepIcon className="bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]"><Instagram className="h-6 w-6" /></StepIcon>
                <Title t={L.ig_t} d={L.ig_d} />
                {igError && <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13.5px] text-brand-800"><b>{L.ig_err}:</b> {igError}</div>}
                {account ? (
                  <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <span className="relative">
                      {account.picture_url ? <img src={account.picture_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-ink-3"><UserRound className="h-6 w-6" /></span>}
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-emerald-50 bg-emerald-500 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">@{account.username}</span>
                      <span className="text-[13px] font-semibold text-emerald-700">{L.ig_ok}</span>
                    </span>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-2.5 rounded-2xl bg-white p-5 ring-1 ring-line">
                      {L.ig_req.map(r => <li key={r} className="flex items-start gap-3 text-[14px] text-ink-2"><BadgeCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-500" />{r}</li>)}
                    </ul>
                    {me.ig_ready ? (
                      <a href="/instagram/connect?next=welcome" className="mt-5 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(221,42,123,.7)] transition hover:brightness-110">
                        <Instagram className="h-5 w-5" />{L.ig_btn}
                      </a>
                    ) : <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{L.ig_na}</p>}
                  </>
                )}
                <Nav back={L.back} onBack={() => go('biz')} next={account ? L.next : L.later} ghost={!account} onNext={() => go('ai')} />
              </>
            )}

            {step === 'ai' && (
              <>
                <StepIcon className="bg-gradient-to-br from-[#6d5dfc] to-[#e5161f]"><Sparkles className="h-6 w-6" /></StepIcon>
                <Title t={L.ai_t} d={L.ai_d} />
                <Label hint={L.ai_tip}>{L.ai_lbl}</Label>
                <textarea value={about} onChange={e => setAbout(e.target.value)} rows={6} maxLength={4000}
                  placeholder={L.ai_ph[(biz || 'other') as Biz]} className="input resize-y leading-relaxed" />
                {!about && (
                  <button onClick={() => setAbout(L.ai_ph[(biz || 'other') as Biz])} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">
                    <Sparkles className="h-3.5 w-3.5" />{lang === 'uz' ? 'Namunani qo\'yish' : lang === 'tj' ? 'Гузоштани намуна' : lang === 'en' ? 'Use the example' : 'Вставить пример'}
                  </button>
                )}
                {account ? (
                  <label className="mt-5 flex cursor-pointer items-center gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-line">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><Bot className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{L.ai_on}</span><span className="block text-[12.5px] text-ink-3">{L.ai_on_d}</span></span>
                    <Toggle checked={aiOn} onChange={setAiOn} />
                  </label>
                ) : <p className="mt-4 text-[13px] text-ink-3">{L.ai_noacc}</p>}
                <Nav back={L.back} onBack={() => go('instagram')} next={L.next} busy={busy} skip={L.skip} onSkip={() => go('flow')}
                  disabled={!about.trim()} onNext={async () => {
                    setBusy(true)
                    await save({ about })
                    if (account) {
                      try {
                        await api.put(`/api/accounts/${account.id}/integrations`, { ai_prompt: about, ai_enabled: aiOn })
                        setAiSaved(aiOn)
                      } catch { toast('Error', 'error') }
                    }
                    setBusy(false)
                    go('flow')
                  }} />
              </>
            )}

            {step === 'flow' && (
              <FlowStep L={L} goals={goals} accountId={account?.id} onBack={() => go('ai')}
                onDone={f => { setFlow(f); go('done') }} />
            )}

            {step === 'done' && (
              <div className="text-center sm:text-left">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-600 text-white shadow-[0_16px_40px_-14px_rgba(229,22,31,.7)] sm:mx-0"><PartyPopper className="h-8 w-8" /></span>
                <Title t={L.done_t} d={L.done_d} />
                <ul className="space-y-2 text-left">
                  {([['biz', !!biz], ['ig', !!account], ['ai', aiSaved || !!(about && account)], ['flow', !!flow]] as const).map(([k, ok]) => (
                    <li key={k} className={`flex items-center gap-3 rounded-2xl p-3.5 ${ok ? 'bg-white ring-1 ring-line' : 'bg-transparent ring-1 ring-dashed ring-line'}`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ok ? 'bg-emerald-500 text-white' : 'bg-soft text-ink-4'}`}>{ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-ink-4" />}</span>
                      <span className={`text-[14px] font-semibold ${ok ? '' : 'text-ink-4'}`}>{L.done_items[k]}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 rounded-2xl bg-white p-5 text-left ring-1 ring-line">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-ink-4">{L.done_next}</div>
                  <ul className="mt-3 space-y-2">{L.done_tips.map((x, i) => <li key={x} className="flex gap-3 text-[14px] text-ink-2"><span className="font-bold text-brand-600">{i + 1}.</span>{x}</li>)}</ul>
                </div>
                <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                  <button disabled={busy} onClick={() => finish()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(229,22,31,.6)] hover:bg-brand-700 disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{L.go}<ArrowRight className="h-4 w-4" />
                  </button>
                  {flow && <button disabled={busy} onClick={() => finish(`/app/flows/${flow.id}`)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 text-[15px] font-semibold hover:bg-soft">
                    <Workflow className="h-4 w-4" />{L.open_flow}
                  </button>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

type LT = (typeof TX)['ru']

function FlowStep({ L, goals, accountId, onBack, onDone }: { L: LT; goals: Goal[]; accountId?: number; onBack: () => void; onDone: (f: FlowSummary | null) => void }) {
  const templates = useTemplates()
  const rec = recommended(goals)
  const [pick, setPick] = useState<string>(rec)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const sorted = useMemo(() => [...templates].sort((a, b) => (a.key === rec ? -1 : b.key === rec ? 1 : 0)), [templates, rec])
  const create = async () => {
    if (!accountId) return onDone(null)
    setBusy(true)
    try {
      onDone(await api.post<FlowSummary>('/api/flows', { account_id: accountId, template: pick }))
    } catch { toast('Error', 'error'); setBusy(false) }
  }
  return (
    <>
      <StepIcon className="bg-ink"><Workflow className="h-6 w-6" /></StepIcon>
      <Title t={L.flow_t} d={L.flow_d} />
      {!accountId ? <p className="rounded-2xl bg-white p-5 text-[14px] leading-relaxed text-ink-2 ring-1 ring-line">{L.flow_noacc}</p> : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {sorted.map((tp: Template) => {
            const Icon = TPL_ICON[tp.icon] ?? Tag, on = pick === tp.key
            return (
              <button key={tp.key} onClick={() => setPick(tp.key)}
                className={`relative flex flex-col items-start rounded-2xl border-2 bg-white p-4 text-left transition ${on ? 'border-brand-600 shadow-[0_10px_30px_-14px_rgba(229,22,31,.5)]' : 'border-transparent ring-1 ring-line hover:ring-ink/20'}`}>
                <span className="flex w-full items-center gap-2">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}><Icon className="h-[18px] w-[18px]" /></span>
                  {tp.key === rec && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">★ {L.flow_rec}</span>}
                </span>
                <span className="mt-3 text-[14.5px] font-bold leading-tight">{tp.name}</span>
                <span className="mt-1 text-[12.5px] leading-snug text-ink-3">{tp.description}</span>
              </button>
            )
          })}
        </div>
      )}
      <Nav back={L.back} onBack={onBack} next={accountId ? L.flow_btn : L.next} busy={busy} skip={accountId ? L.skip : undefined}
        onSkip={() => onDone(null)} onNext={create} disabled={!!accountId && !templates.length} />
    </>
  )
}

/* ------------------------------------------------------------------ kichik qismlar */

function Title({ t, d }: { t: string; d: string }) {
  return (
    <div className="mb-6 mt-3">
      <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">{t}</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-3">{d}</p>
    </div>
  )
}

function StepIcon({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`grid h-14 w-14 place-items-center rounded-2xl text-white shadow-pop ${className}`}>{children}</span>
}

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-7 first:mt-0">
      <div className="text-[14px] font-bold">{children}</div>
      {hint && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{hint}</div>}
    </div>
  )
}

function Nav({ back, onBack, next, onNext, disabled, busy, skip, onSkip, ghost }: {
  back?: string; onBack?: () => void; next: string; onNext: () => void; disabled?: boolean; busy?: boolean; skip?: string; onSkip?: () => void; ghost?: boolean
}) {
  return (
    <div className="mt-9 flex items-center gap-2">
      {back && <button onClick={onBack} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-ink-3 hover:bg-white hover:text-ink"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">{back}</span></button>}
      <span className="flex-1" />
      {skip && <button onClick={onSkip} className="h-12 whitespace-nowrap rounded-xl px-3 text-[14px] font-semibold text-ink-3 hover:bg-white hover:text-ink sm:px-4">{skip}</button>}
      <button disabled={disabled || busy} onClick={onNext}
        className={`inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[15px] sm:px-6 font-semibold transition disabled:opacity-40 ${ghost ? 'border border-line bg-white text-ink hover:bg-soft' : 'bg-brand-600 text-white shadow-[0_10px_24px_-8px_rgba(229,22,31,.6)] hover:bg-brand-700'}`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{next}<ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}
