import { useEffect, useState } from 'react'
import { Bot, Check, Copy, KeyRound, Plus, ShieldCheck, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { api, ApiError } from '../api'
import { useI18n, type Lang } from '../i18n'
import { Button, Modal, Spinner, useToast } from './ui'

type Token = { id: number; name: string; prefix: string; scope: 'read' | 'write'; created_at: string; last_used_at: string | null; token?: string }

const TX: Record<Lang, Record<string, string>> = {
  ru: {
    hero_t: 'ChatFlow внутри Claude и ChatGPT', hero_d: 'Подключите ИИ-ассистента по протоколу MCP — и управляйте Instagram-продажами обычным текстом.',
    ex_t: 'Например, спросите:', ex1: '«Сколько заявок пришло за неделю и какой пост дал больше всего?»', ex2: '«Покажи лидов, которые оставили телефон, но молчат 2 дня»',
    ex3: '«Создай сценарий: на комментарий СКИДКА — отправь в директ промокод»', ex4: '«Переведи Мадину в „Оплачен“ и напомни позвонить завтра в 10:00»',
    keys: 'API-ключи', none: 'Ключей пока нет. Создайте первый — это займёт 10 секунд.', create: 'Создать ключ', name: 'Название', name_ph: 'Например: Claude Desktop',
    access: 'Доступ', read: 'Только чтение', read_d: 'Статистика, клиенты, переписки, сценарии', write: 'Чтение и действия', write_d: '+ CRM, заметки, создание сценариев, отправка сообщений',
    used: 'использован', never: 'ещё не использовался', revoke: 'Отозвать', revoke_q: 'Отозвать ключ? Подключённые ассистенты сразу потеряют доступ.',
    new_t: 'Ключ создан', new_d: 'Скопируйте его сейчас — после закрытия окна ключ больше не будет показан.', copy: 'Копировать', copied: 'Скопировано',
    how: 'Как подключить', url: 'Адрес MCP-сервера', done: 'Готово', safety: 'Ключ даёт доступ к данным вашего аккаунта. Не публикуйте его и отзовите, если он попал в чужие руки.',
    limit: 'Можно создать не больше 10 ключей',
  },
  uz: {
    hero_t: 'ChatFlow Claude va ChatGPT ichida', hero_d: "AI-yordamchini MCP protokoli orqali ulang va Instagram savdolaringizni oddiy matn bilan boshqaring.",
    ex_t: "Masalan, so'rang:", ex1: "«Bir haftada nechta zayavka keldi va qaysi post ko'proq lid berdi?»", ex2: "«Telefon qoldirgan, lekin 2 kundan beri jim lidlarni ko'rsat»",
    ex3: "«Ssenariy yasa: СКИДКА izohiga Direct'ga promokod yubor»", ex4: "«Madinani „Оплачен“ga o'tkaz va ertaga 10:00 da qo'ng'iroqni eslat»",
    keys: 'API kalitlar', none: "Hali kalit yo'q. Birinchisini yarating — 10 soniya oladi.", create: 'Kalit yaratish', name: 'Nomi', name_ph: 'Masalan: Claude Desktop',
    access: 'Ruxsat', read: "Faqat o'qish", read_d: 'Statistika, mijozlar, yozishmalar, ssenariylar', write: "O'qish va amallar", write_d: "+ CRM, izohlar, ssenariy yaratish, xabar yuborish",
    used: 'ishlatilgan', never: 'hali ishlatilmagan', revoke: 'Bekor qilish', revoke_q: "Kalit bekor qilinsinmi? Ulangan yordamchilar darhol kirish huquqini yo'qotadi.",
    new_t: 'Kalit yaratildi', new_d: "Hozir nusxa oling — oyna yopilgach kalit boshqa ko'rsatilmaydi.", copy: 'Nusxa olish', copied: 'Nusxa olindi',
    how: 'Qanday ulanadi', url: 'MCP server manzili', done: 'Tayyor', safety: "Kalit akkauntingiz ma'lumotlariga kirish beradi. Uni hech kimga bermang, begona qo'lga tushsa — bekor qiling.",
    limit: "Ko'pi bilan 10 ta kalit yaratish mumkin",
  },
  tj: {
    hero_t: 'ChatFlow дар дохили Claude ва ChatGPT', hero_d: 'Ёрдамчии AI-ро тавассути протоколи MCP пайваст кунед ва фурӯши Instagram-ро бо матни оддӣ идора кунед.',
    ex_t: 'Масалан, пурсед:', ex1: '«Дар як ҳафта чанд дархост омад ва кадом пост бештар лид дод?»', ex2: '«Лидҳоеро нишон деҳ, ки телефон монданд, вале 2 рӯз хомӯшанд»',
    ex3: '«Сенария соз: ба шарҳи СКИДКА ба директ промокод фирист»', ex4: '«Мадинаро ба „Оплачен“ гузарон ва фардо соати 10:00 занг заданро ёдрас кун»',
    keys: 'Калидҳои API', none: 'Ҳоло калид нест. Аввалинро созед — 10 сония мегирад.', create: 'Сохтани калид', name: 'Ном', name_ph: 'Масалан: Claude Desktop',
    access: 'Дастрасӣ', read: 'Танҳо хондан', read_d: 'Омор, мизоҷон, мукотиба, сенарияҳо', write: 'Хондан ва амалҳо', write_d: '+ CRM, қайдҳо, сохтани сенария, фиристодани паём',
    used: 'истифода шуд', never: 'ҳанӯз истифода нашудааст', revoke: 'Бекор кардан', revoke_q: 'Калид бекор карда шавад? Ёрдамчиёни пайваст фавран дастрасиро гум мекунанд.',
    new_t: 'Калид сохта шуд', new_d: 'Ҳозир нусха гиред — баъди пӯшидани равзана калид дигар нишон дода намешавад.', copy: 'Нусха гирифтан', copied: 'Нусха гирифта шуд',
    how: 'Чӣ тавр пайваст кардан', url: 'Суроғаи сервери MCP', done: 'Тайёр', safety: 'Калид ба маълумоти аккаунти шумо дастрасӣ медиҳад. Онро ба касе надиҳед ва агар ба дасти бегона афтад, бекор кунед.',
    limit: 'Зиёда аз 10 калид сохтан мумкин нест',
  },
  en: {
    hero_t: 'ChatFlow inside Claude and ChatGPT', hero_d: 'Connect an AI assistant over MCP and run your Instagram sales in plain language.',
    ex_t: 'For example, ask:', ex1: '“How many leads came in this week and which post brought the most?”', ex2: '“Show leads who left a phone number but have been silent for 2 days”',
    ex3: '“Create a flow: when someone comments SALE, DM them a promo code”', ex4: '“Move Madina to Paid and remind me to call her tomorrow at 10:00”',
    keys: 'API keys', none: 'No keys yet. Create your first one — it takes 10 seconds.', create: 'Create key', name: 'Name', name_ph: 'e.g. Claude Desktop',
    access: 'Access', read: 'Read only', read_d: 'Stats, contacts, conversations, flows', write: 'Read & act', write_d: '+ CRM, notes, creating flows, sending messages',
    used: 'used', never: 'never used', revoke: 'Revoke', revoke_q: 'Revoke this key? Connected assistants lose access immediately.',
    new_t: 'Key created', new_d: 'Copy it now — once you close this window the key will not be shown again.', copy: 'Copy', copied: 'Copied',
    how: 'How to connect', url: 'MCP server URL', done: 'Done', safety: 'The key gives access to your account data. Never share it, and revoke it if it leaks.',
    limit: 'You can create up to 10 keys',
  },
}

function CopyBox({ text, label, mono = true }: { text: string; label?: string; mono?: boolean }) {
  const [ok, setOk] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setOk(true); window.setTimeout(() => setOk(false), 1500) } catch { /* brauzer ruxsat bermadi */ } }
  return (
    <div className="group relative">
      {label && <div className="mb-1.5 text-[12px] font-semibold text-ink-3">{label}</div>}
      <pre className={`overflow-x-auto whitespace-pre rounded-xl bg-[#14141a] px-4 py-3 pr-12 text-[12.5px] leading-relaxed text-white/90 ${mono ? 'font-mono' : ''}`}>{text}</pre>
      <button onClick={copy} className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 transition hover:bg-white/20" title="Copy">
        {ok ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

const CLIENTS = ['claude_code', 'claude_desktop', 'cursor'] as const
const CLIENT_LABEL: Record<(typeof CLIENTS)[number], string> = { claude_code: 'Claude Code', claude_desktop: 'Claude Desktop', cursor: 'Cursor / Windsurf' }

function snippet(kind: (typeof CLIENTS)[number], url: string, key: string) {
  if (kind === 'claude_code') return `claude mcp add --transport http chatflow ${url} \\\n  --header "Authorization: Bearer ${key}"`
  if (kind === 'claude_desktop') return JSON.stringify({ mcpServers: { chatflow: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH}'], env: { AUTH: `Bearer ${key}` } } } }, null, 2)
  return JSON.stringify({ mcpServers: { chatflow: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)
}

export default function ApiKeys() {
  const { lang } = useI18n()
  const x = TX[lang] || TX.en
  const toast = useToast()
  const [items, setItems] = useState<Token[] | null>(null)
  const [url, setUrl] = useState('')
  const [form, setForm] = useState<{ name: string; scope: 'read' | 'write' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<Token | null>(null)
  const [client, setClient] = useState<(typeof CLIENTS)[number]>('claude_code')

  const load = () => api.get<{ items: Token[]; mcp_url: string }>('/api/tokens').then(r => { setItems(r.items); setUrl(r.mcp_url) }).catch(() => setItems([]))
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form) return
    setBusy(true)
    try {
      const t = await api.post<Token>('/api/tokens', { name: form.name.trim() || 'MCP', scope: form.scope })
      setForm(null); setFresh(t); load()
    } catch (e) { toast(e instanceof ApiError && e.code === 'too_many_tokens' ? x.limit : 'Error', 'error') } finally { setBusy(false) }
  }
  const revoke = async (t: Token) => {
    if (!window.confirm(x.revoke_q)) return
    await api.del(`/api/tokens/${t.id}`); load()
  }
  const when = (s: string | null) => s ? new Date(s).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const key = fresh?.token || 'cf_…'

  return (
    <div className="space-y-5">
      {/* tanishtiruv */}
      <section className="animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-[#16161c] via-[#1d1424] to-[#2a0f16] p-6 text-white">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.14em] text-white/50"><Sparkles className="h-3.5 w-3.5 text-brand-400" />MCP</div>
        <h2 className="mt-2 text-[22px] font-extrabold leading-tight tracking-tight">{x.hero_t}</h2>
        <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-white/70">{x.hero_d}</p>
        <div className="mt-4 text-[12px] font-semibold text-white/50">{x.ex_t}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[x.ex1, x.ex2, x.ex3, x.ex4].map(e => (
            <div key={e} className="flex gap-2.5 rounded-2xl bg-white/[.06] px-3.5 py-3 text-[13px] leading-snug text-white/85"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />{e}</div>
          ))}
        </div>
      </section>

      {/* kalitlar */}
      <section className="animate-fade-up rounded-3xl border border-line bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft text-ink-2"><KeyRound className="h-4 w-4" /></span>
          <h2 className="flex-1 text-[16px] font-bold">{x.keys}</h2>
          <Button size="sm" onClick={() => setForm({ name: '', scope: 'read' })}><Plus className="h-4 w-4" />{x.create}</Button>
        </div>
        {items === null ? <div className="grid place-items-center py-6"><Spinner /></div>
          : items.length === 0 ? <div className="rounded-2xl bg-soft px-4 py-5 text-center text-[13px] text-ink-3">{x.none}</div>
            : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {items.map(t => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-semibold">{t.name}</span>
                        <span className={`chip ${t.scope === 'write' ? 'bg-brand-50 text-brand-700' : ''}`}>{t.scope === 'write' ? x.write : x.read}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-ink-4"><span className="font-mono">{t.prefix}…</span> · {t.last_used_at ? `${x.used} ${when(t.last_used_at)}` : x.never}</div>
                    </div>
                    <button onClick={() => revoke(t)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-3 hover:bg-brand-50 hover:text-brand-700">
                      <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">{x.revoke}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        <div className="mt-4 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900"><ShieldCheck className="h-4 w-4 shrink-0" />{x.safety}</div>
      </section>

      {/* ulanish */}
      <section className="animate-fade-up rounded-3xl border border-line bg-white p-6">
        <h2 className="mb-4 text-[16px] font-bold">{x.how}</h2>
        {url && <CopyBox label={x.url} text={url} />}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-soft p-1">
          {CLIENTS.map(c => (
            <button key={c} onClick={() => setClient(c)} className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${client === c ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>{CLIENT_LABEL[c]}</button>
          ))}
        </div>
        <div className="mt-3"><CopyBox text={snippet(client, url, key)} /></div>
      </section>

      {/* yaratish oynasi */}
      <Modal open={!!form} onClose={() => setForm(null)} title={x.create} icon={<KeyRound className="h-5 w-5" />}>
        {form && (
          <>
            <label className="block"><span className="label">{x.name}</span>
              <input className="input" autoFocus maxLength={80} value={form.name} placeholder={x.name_ph} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <div className="mt-4"><span className="label">{x.access}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['read', 'write'] as const).map(s => (
                  <button key={s} onClick={() => setForm({ ...form, scope: s })}
                    className={`rounded-2xl border p-3.5 text-left transition ${form.scope === s ? 'border-ink bg-ink text-white' : 'border-line hover:bg-soft'}`}>
                    <div className="text-[13.5px] font-semibold">{s === 'read' ? x.read : x.write}</div>
                    <div className={`mt-0.5 text-[12px] leading-snug ${form.scope === s ? 'text-white/65' : 'text-ink-4'}`}>{s === 'read' ? x.read_d : x.write_d}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end"><Button onClick={create} loading={busy}>{x.create}</Button></div>
          </>
        )}
      </Modal>

      {/* yangi kalit — faqat bir marta */}
      <Modal open={!!fresh} onClose={() => setFresh(null)} title={x.new_t} icon={<Check className="h-5 w-5" />}>
        {fresh?.token && (
          <>
            <div className="mb-3 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900"><TriangleAlert className="h-4 w-4 shrink-0" />{x.new_d}</div>
            <CopyBox text={fresh.token} />
            <div className="mt-4 text-[12px] font-semibold text-ink-3">{CLIENT_LABEL[client]}</div>
            <div className="mt-1.5"><CopyBox text={snippet(client, url, fresh.token)} /></div>
            <div className="mt-5 flex justify-end"><Button onClick={() => setFresh(null)}>{x.done}</Button></div>
          </>
        )}
      </Modal>
    </div>
  )
}
