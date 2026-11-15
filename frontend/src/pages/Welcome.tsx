import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Bot, Check, CircleDot, Gift, GraduationCap, Instagram, Loader2, Megaphone,
  MessageCircle, MoreHorizontal, PartyPopper, Phone, Rocket, Scissors, ShieldCheck, ShoppingBag, Sparkles, Tag, UserRound, Workflow, Zap,
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
  const [dir, setDir] = useState(1)
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

  const goTo = (s: Step) => { setDir(ORDER.indexOf(s) >= ORDER.indexOf(step) ? 1 : -1); go(s) }
  const stepNo = (L.steps as readonly string[]).length

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f6f5f7]">
      {/* fon: harakatlanuvchi brend dog'lari + nuqtali to'r */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-blob absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-brand-200/50 blur-[110px]" />
        <div className="animate-blob absolute -right-48 top-1/3 h-[520px] w-[520px] rounded-full bg-[#e9d8ff]/60 blur-[120px]" style={{ animationDelay: '-6s' }} />
        <div className="animate-blob absolute -bottom-56 left-1/4 h-[480px] w-[480px] rounded-full bg-[#ffd9c7]/50 blur-[120px]" style={{ animationDelay: '-12s' }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(17,17,20,.055)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      </div>

      {/* yuqori panel */}
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <Logo size={28} />
        {step !== 'done' && (
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1.5 sm:flex" aria-label={`${idx + 1}/${stepNo}`}>
            {L.steps.map((s, i) => (
              <span key={s} title={s} className={`h-2 rounded-full transition-all duration-500 ${i === idx ? 'w-9 bg-brand-600' : i < idx ? 'w-2 bg-ink' : 'w-2 bg-ink/15'}`} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <LangSwitch />
          {step !== 'done' && <button onClick={() => finish()} className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold text-ink-3 transition hover:bg-white/70 hover:text-ink"><span className="sm:hidden">{L.skip}</span><span className="hidden sm:inline">{L.skip_all}</span></button>}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[680px] px-3 pb-12 pt-2 sm:px-6 sm:pt-6">
        <div key={step} className={dir > 0 ? 'slide-in-r' : 'slide-in-l'}>
          {step === 'biz' && (
            <Slide tone="biz" icon={<Rocket className="h-7 w-7" />} eyebrow={`${L.hello(name)}`} n={1} total={stepNo} title={L.biz_t} desc={L.biz_d}
              deco={<><Chip className="right-8 top-7">🎓</Chip><Chip className="right-24 top-16 sm:right-28">🛍️</Chip><Chip className="right-6 top-[88px]">✂️</Chip></>}
              footer={<Nav next={L.next} disabled={!biz} onNext={() => { save({ biz, goals }); goTo('instagram') }} />}>
              <Label>{L.biz_q}</Label>
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.keys(L.biz) as Biz[]).map(k => {
                  const Icon = BIZ_ICON[k], on = biz === k
                  return (
                    <button key={k} onClick={() => setBiz(k)}
                      className={`group relative flex flex-col items-start rounded-2xl p-4 text-left transition duration-300 ${on ? 'bg-ink text-white shadow-[0_18px_40px_-18px_rgba(17,17,20,.7)]' : 'bg-soft hover:-translate-y-0.5 hover:bg-white hover:shadow-pop'}`}>
                      <span className={`grid h-10 w-10 place-items-center rounded-xl transition ${on ? 'bg-brand-600 text-white' : 'bg-white text-ink-2 shadow-card'}`}><Icon className="h-5 w-5" /></span>
                      <span className="mt-3 text-[14.5px] font-bold leading-tight">{L.biz[k][0]}</span>
                      <span className={`mt-0.5 text-[12.5px] leading-snug ${on ? 'text-white/60' : 'text-ink-3'}`}>{L.biz[k][1]}</span>
                      <span className={`absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full transition ${on ? 'scale-100 bg-brand-600 text-white' : 'scale-0'}`}><Check className="h-3 w-3" strokeWidth={3.5} /></span>
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
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold transition ${on ? 'bg-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(229,22,31,.7)]' : 'bg-soft text-ink-2 hover:bg-line/70'}`}>
                      {on ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}{L.goals[g]}
                    </button>
                  )
                })}
              </div>
            </Slide>
          )}

          {step === 'instagram' && (
            <Slide tone="ig" icon={<Instagram className="h-7 w-7" />} n={2} total={stepNo} title={L.ig_t} desc={L.ig_d}
              deco={<><Chip className="right-6 top-8">@your_brand</Chip><Chip className="right-14 top-[86px] sm:right-20"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />Meta API</Chip></>}
              footer={<Nav back={L.back} onBack={() => goTo('biz')} next={account ? L.next : L.later} ghost={!account} onNext={() => goTo('ai')} />}>
              {igError && <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-[13.5px] text-brand-800"><b>{L.ig_err}:</b> {igError}</div>}
              {account ? (
                <div className="pop-in flex items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-4 ring-1 ring-emerald-200">
                  <span className="relative shrink-0 rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2.5px]">
                    {account.picture_url ? <img src={account.picture_url} alt="" className="h-14 w-14 rounded-full border-2 border-white object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-white text-ink-3"><UserRound className="h-6 w-6" /></span>}
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">@{account.username}</span>
                    <span className="text-[13px] font-semibold text-emerald-700">{L.ig_ok}</span>
                  </span>
                </div>
              ) : (
                <>
                  <ol className="space-y-2">
                    {L.ig_req.map((r, i) => (
                      <li key={r} className="flex items-center gap-3.5 rounded-2xl bg-soft px-4 py-3.5 text-[14px] text-ink-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[12.5px] font-bold text-ink shadow-card">{i + 1}</span>{r}
                      </li>
                    ))}
                  </ol>
                  {me.ig_ready ? (
                    <a href="/instagram/connect?next=welcome" className="group mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-[15.5px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(221,42,123,.8)] transition hover:brightness-110">
                      <Instagram className="h-5 w-5" />{L.ig_btn}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </a>
                  ) : <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{L.ig_na}</p>}
                </>
              )}
            </Slide>
          )}

          {step === 'ai' && (
            <Slide tone="ai" icon={<Sparkles className="h-7 w-7" />} n={3} total={stepNo} title={L.ai_t} desc={L.ai_d}
              deco={<><Bubble className="right-6 top-7" mine={false}>💬 ?</Bubble><Bubble className="right-10 top-[74px] sm:right-16" mine>✨ 24/7 · 2s</Bubble></>}
              footer={<Nav back={L.back} onBack={() => goTo('instagram')} next={L.next} busy={busy} skip={L.skip} onSkip={() => goTo('flow')}
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
                  goTo('flow')
                }} />}>
              <Label hint={L.ai_tip}>{L.ai_lbl}</Label>
              <div className="relative">
                <textarea value={about} onChange={e => setAbout(e.target.value)} rows={6} maxLength={4000}
                  placeholder={L.ai_ph[(biz || 'other') as Biz]} className="input resize-y rounded-2xl border-transparent bg-soft leading-relaxed focus:bg-white" />
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] tabular-nums text-ink-4">{about.length}/4000</span>
              </div>
              {!about && (
                <button onClick={() => setAbout(L.ai_ph[(biz || 'other') as Biz])} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-[12.5px] font-semibold text-violet-700 transition hover:bg-violet-100">
                  <Sparkles className="h-3.5 w-3.5" />{lang === 'uz' ? "Namunani qo'yish" : lang === 'tj' ? 'Гузоштани намуна' : lang === 'en' ? 'Use the example' : 'Вставить пример'}
                </button>
              )}
              {account ? (
                <label className="mt-5 flex cursor-pointer items-center gap-3.5 rounded-2xl bg-gradient-to-r from-violet-50 to-brand-50/60 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white"><Bot className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold">{L.ai_on}</span><span className="block text-[12.5px] text-ink-3">{L.ai_on_d}</span></span>
                  <Toggle checked={aiOn} onChange={setAiOn} />
                </label>
              ) : <p className="mt-4 text-[13px] text-ink-3">{L.ai_noacc}</p>}
            </Slide>
          )}

          {step === 'flow' && (
            <FlowStep L={L} goals={goals} accountId={account?.id} total={stepNo} onBack={() => goTo('ai')}
              onDone={f => { setFlow(f); goTo('done') }} />
          )}

          {step === 'done' && (
            <Slide tone="done" icon={<PartyPopper className="h-7 w-7" />} title={L.done_t} desc={L.done_d}
              deco={<Confetti />}
              footer={
                <div className="flex w-full flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                  {flow && <button disabled={busy} onClick={() => finish(`/app/flows/${flow.id}`)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[14.5px] font-semibold text-ink-2 transition hover:bg-soft">
                    <Workflow className="h-4 w-4" />{L.open_flow}
                  </button>}
                  <button disabled={busy} onClick={() => finish()} className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(17,17,20,.7)] transition hover:bg-black disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{L.go}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </button>
                </div>}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {([['biz', !!biz], ['ig', !!account], ['ai', aiSaved || !!(about && account)], ['flow', !!flow]] as const).map(([k, ok], i) => (
                  <li key={k} className={`pop-in flex items-center gap-3 rounded-2xl p-3.5 ${ok ? 'bg-emerald-50/70' : 'bg-soft'}`} style={{ animationDelay: `${150 + i * 110}ms` }}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ok ? 'bg-emerald-500 text-white' : 'bg-white text-ink-4'}`}>{ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-ink-4" />}</span>
                    <span className={`text-[13.5px] font-semibold ${ok ? '' : 'text-ink-4'}`}>{L.done_items[k]}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-2xl bg-ink p-5 text-white">
                <div className="text-[11.5px] font-bold uppercase tracking-[.12em] text-brand-400">{L.done_next}</div>
                <ul className="mt-3 space-y-2.5">{L.done_tips.map((x, i) => <li key={x} className="flex gap-3 text-[14px] text-white/85"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold">{i + 1}</span>{x}</li>)}</ul>
              </div>
              <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-3"><Gift className="h-4 w-4 text-brand-600" />{L.trial}</p>
            </Slide>
          )}
        </div>

        {/* mobil progress */}
        {step !== 'done' && (
          <div className="mt-5 flex items-center justify-center gap-1.5 sm:hidden">
            {L.steps.map((s, i) => <span key={s} className={`h-1.5 rounded-full transition-all duration-500 ${i === idx ? 'w-8 bg-brand-600' : i < idx ? 'w-1.5 bg-ink' : 'w-1.5 bg-ink/15'}`} />)}
          </div>
        )}
      </main>
    </div>
  )
}

type LT = (typeof TX)['ru']

function FlowStep({ L, goals, accountId, total, onBack, onDone }: { L: LT; goals: Goal[]; accountId?: number; total: number; onBack: () => void; onDone: (f: FlowSummary | null) => void }) {
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
    <Slide tone="flow" icon={<Workflow className="h-7 w-7" />} n={4} total={total} title={L.flow_t} desc={L.flow_d}
      deco={<MiniNodes />}
      footer={<Nav back={L.back} onBack={onBack} next={accountId ? L.flow_btn : L.next} busy={busy} skip={accountId ? L.skip : undefined}
        onSkip={() => onDone(null)} onNext={create} disabled={!!accountId && !templates.length} />}>
      {!accountId ? <p className="rounded-2xl bg-soft p-5 text-[14px] leading-relaxed text-ink-2">{L.flow_noacc}</p> : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {sorted.map((tp: Template) => {
            const Icon = TPL_ICON[tp.icon] ?? Tag, on = pick === tp.key
            return (
              <button key={tp.key} onClick={() => setPick(tp.key)}
                className={`relative flex flex-col items-start rounded-2xl p-4 text-left transition duration-300 ${on ? 'bg-ink text-white shadow-[0_18px_40px_-18px_rgba(17,17,20,.7)]' : 'bg-soft hover:-translate-y-0.5 hover:bg-white hover:shadow-pop'}`}>
                <span className="flex w-full items-center gap-2">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-white text-brand-600 shadow-card'}`}><Icon className="h-[18px] w-[18px]" /></span>
                  {tp.key === rec && <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-white/15 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>★ {L.flow_rec}</span>}
                </span>
                <span className="mt-3 text-[14.5px] font-bold leading-tight">{tp.name}</span>
                <span className={`mt-1 text-[12.5px] leading-snug ${on ? 'text-white/60' : 'text-ink-3'}`}>{tp.description}</span>
              </button>
            )
          })}
        </div>
      )}
    </Slide>
  )
}

/* ------------------------------------------------------------------ slayd va bezaklar */

const TONES: Record<string, { band: string; tile: string }> = {
  biz: { band: 'bg-gradient-to-br from-[#16131c] via-[#2a1018] to-[#e5161f]', tile: 'text-brand-600' },
  ig: { band: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]', tile: 'text-[#dd2a7b]' },
  ai: { band: 'bg-gradient-to-br from-[#5b4bff] via-[#9b3fe0] to-[#e5161f]', tile: 'text-violet-600' },
  flow: { band: 'bg-gradient-to-br from-[#111114] via-[#1d1d24] to-[#3a3a46]', tile: 'text-ink' },
  done: { band: 'bg-gradient-to-br from-[#e5161f] via-[#ff4d55] to-[#ff9a62]', tile: 'text-brand-600' },
}

function Slide({ tone, icon, eyebrow, n, total, title, desc, deco, children, footer }: {
  tone: keyof typeof TONES; icon: ReactNode; eyebrow?: string; n?: number; total?: number; title: string; desc: string
  deco?: ReactNode; children: ReactNode; footer: ReactNode
}) {
  const t = TONES[tone]
  return (
    <section className="overflow-hidden rounded-[32px] bg-white shadow-[0_40px_90px_-40px_rgba(17,17,20,.45)] ring-1 ring-black/[.04]">
      <div className={`relative h-[136px] overflow-hidden sm:h-[150px] ${t.band}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,.16)_1px,transparent_0)] [background-size:18px_18px]" />
        <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        {n && <div className="absolute left-6 top-5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold tracking-wide text-white backdrop-blur sm:left-8">{n} / {total}</div>}
        {deco}
      </div>
      <div className="relative px-6 pb-7 sm:px-9">
        <span className={`pop-in -mt-9 grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-white shadow-[0_14px_34px_-12px_rgba(17,17,20,.35)] ring-1 ring-black/[.04] ${t.tile}`}>{icon}</span>
        {eyebrow && <div className="mt-5 text-[14px] font-semibold text-brand-600">{eyebrow}</div>}
        <h1 className={`${eyebrow ? 'mt-1' : 'mt-5'} text-[27px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[34px]`}>{title}</h1>
        <p className="mt-2.5 max-w-[520px] text-[15px] leading-relaxed text-ink-3">{desc}</p>
        <div className="mt-6">{children}</div>
      </div>
      <div className="flex items-center gap-2 border-t border-line/80 bg-[#fbfbfc] px-4 py-3.5 sm:px-6">{footer}</div>
    </section>
  )
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`absolute rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-ink shadow-[0_10px_24px_-10px_rgba(0,0,0,.5)] backdrop-blur ${className}`} style={{ animation: 'float 6s ease-in-out infinite' }}>{children}</span>
}

function Bubble({ className, mine, children }: { className: string; mine: boolean; children: ReactNode }) {
  return <span className={`absolute rounded-2xl px-3 py-2 text-[12.5px] font-semibold shadow-[0_10px_24px_-10px_rgba(0,0,0,.5)] ${mine ? 'rounded-br-md bg-white text-violet-700' : 'rounded-bl-md bg-white/20 text-white backdrop-blur'} ${className}`} style={{ animation: 'float 6s ease-in-out infinite' }}>{children}</span>
}

function MiniNodes() {
  return (
    <div className="absolute right-5 top-6 hidden h-[100px] w-[260px] sm:block" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 260 100" fill="none">
        <path d="M78 24 C 110 24, 104 52, 132 52" stroke="#ff6369" strokeWidth="2" strokeDasharray="5 4" className="animate-dash" />
        <path d="M196 52 C 220 52, 214 80, 236 80" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
      </svg>
      <span className="absolute left-0 top-2 flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink shadow-pop"><span className="grid h-5 w-5 place-items-center rounded-md bg-brand-600 text-white"><Zap className="h-3 w-3" /></span>Trigger</span>
      <span className="absolute left-[118px] top-[38px] flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink shadow-pop"><span className="grid h-5 w-5 place-items-center rounded-md bg-ink text-white"><MessageCircle className="h-3 w-3" /></span>Direct</span>
      <span className="absolute right-0 top-[68px] grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow-pop"><Check className="h-4 w-4" strokeWidth={3} /></span>
    </div>
  )
}

function Confetti() {
  const colors = ['#ffffff', '#ffd166', '#111114', '#ffe0e1', '#7b5cff']
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span key={i} className="confetti absolute top-0 block rounded-[2px]"
          style={{ left: `${(i * 37) % 100}%`, width: i % 3 ? 7 : 10, height: i % 2 ? 12 : 7, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.12}s` }} />
      ))}
    </div>
  )
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
  // Enter — keyingi qadam (matn maydonidan tashqari)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === 'Enter' && !e.shiftKey && tag !== 'TEXTAREA' && tag !== 'BUTTON' && tag !== 'A' && !disabled && !busy) onNext()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onNext, disabled, busy])
  return (
    <>
      {back && <button onClick={onBack} title={back} className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-soft hover:text-ink"><ArrowLeft className="h-5 w-5" /></button>}
      <span className="flex-1" />
      {skip && <button onClick={onSkip} className="h-12 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold text-ink-3 transition hover:bg-soft hover:text-ink">{skip}</button>}
      <button disabled={disabled || busy} onClick={onNext}
        className={`group inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full px-6 text-[15px] font-semibold transition disabled:opacity-35 ${ghost ? 'bg-soft text-ink hover:bg-line' : 'bg-ink text-white shadow-[0_14px_30px_-12px_rgba(17,17,20,.7)] hover:bg-black'}`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{next}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </button>
    </>
  )
}
