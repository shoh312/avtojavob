# ChatFlow — Instagram avtomatlashtirish (SaaS)

Instagram izohlar, Direct va story'lar uchun vizual ssenariy quruvchi.

- **2D ssenariy quruvchi** (React Flow): Trigger → Xabar (tugmalar) → Savol → Shart → Amal → Kutish
- Triggerlar: izoh, Direct, story'ga javob, story'da belgilash
- Obuna tekshiruvi, lid yig'ish (telefon/email), teglar, kontaktlar bazasi + CSV
- Har bir blokda statistika, tayyor shablonlar
- 4 til: tojikcha, ruscha, o'zbekcha, inglizcha
- CRM: savdo voronkasi (kanban), bitim summasi, izohlar, mijoz tarixi; lidlar avtomatik tushadi
- Jonli chat (Inbox): barcha Direct yozishmalar, operator javobi, botni pauza qilish
- AI yordamchi (Claude): ssenariy mos kelmagan savollarga biznes ma'lumoti asosida javob
- Telegram xabarnomalar (yangi lidlar, javobsiz xabarlar), webhook (CRM / Make / Zapier)
- Rassilka (24 soat qoidasiga rioya qilgan holda), email tasdiqlash, parolni tiklash, Google orqali kirish
- Tariflar (7 kun sinov, Pro, Business), admin panel, kunlik avtomatik backup

Texnologiya: Python (FastAPI, SQLAlchemy, PostgreSQL) + React (Vite, Tailwind, React Flow).
Frontend build `app/web` papkasida (repoda) — serverda Node.js kerak emas.

### Frontend'ni o'zgartirish

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173 (backend 8000-portda ishlashi kerak)
npm run build    # app/web ga yig'adi — keyin commit qiling
```

## 1. Lokal ishga tushirish

```powershell
cd C:\Users\gameboy\insta-autoreply
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # keyin .env ni to'ldiring
uvicorn app.main:app --reload --port 8000
```

Meta webhook va OAuth uchun **ochiq HTTPS manzil** kerak. Lokal test uchun:

```powershell
cloudflared tunnel --url http://localhost:8000     # yoki: ngrok http 8000
```

Chiqqan `https://....trycloudflare.com` manzilni `.env` dagi `APP_URL` ga yozing va serverni qayta ishga tushiring.

Testlar (Meta'ga ulanmasdan): `python -m pytest -q`

---

## 2. Meta Developer sozlamalari

1. https://developers.facebook.com/apps → ilovangizni oching (yoki yangi yarating:
   use case — **"Manage messaging & content on Instagram"**).
2. Chap menyu: **Instagram → API setup with Instagram login**.
   - **Instagram app ID** → `.env` dagi `IG_APP_ID`
   - **Instagram app secret** → `IG_APP_SECRET`
   > Diqqat: bu asosiy Facebook App ID emas, Instagram bo'limidagi alohida ID/secret.
3. **Configure webhooks**:
   - Callback URL: `https://SIZNING-DOMEN/webhook`
   - Verify token: `.env` dagi `WEBHOOK_VERIFY_TOKEN` bilan bir xil
   - "Verify and save" → keyin **comments** va **messages** maydonlarini Subscribe qiling.
4. **Set up Instagram business login** → *Business login settings*:
   - OAuth redirect URI: `https://SIZNING-DOMEN/instagram/callback`
   - Deauthorize callback URL: `https://SIZNING-DOMEN/deauthorize`
   - Data deletion request URL: `https://SIZNING-DOMEN/data-deletion`
5. **App settings → Basic**: Privacy Policy URL = `/privacy`, Terms URL = `/terms`.
6. **App roles → Roles → Instagram Testers**: o'z Instagram akkauntingizni qo'shing,
   so'ng Instagram'da (Sozlamalar → Veb-saytlar uchun ruxsatlar → Tester takliflari) qabul qiling.

Instagram akkaunt **Business yoki Creator** bo'lishi shart.
Akkauntda: Sozlamalar → Xabarlar → *Connected tools* → **"Allow access to messages"** yoqilgan bo'lsin.

---

## 3. Hamma uchun ochish (App Review)

Hozircha ilova faqat rol berilgan (tester) akkauntlar bilan ishlaydi. Begona foydalanuvchilar uchun:

1. **Business Verification** (Meta Business portfolio orqali, YaTT/firma hujjatlari bilan).
2. **App Review** — quyidagi ruxsatlar uchun **Advanced Access** so'rang:
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
3. Har bir ruxsat uchun screencast (video) kerak: login → akkaunt ulash → qoida yaratish →
   izoh yozish → avtojavob kelishi. Interfeysni ingliz tilida ko'rsatish tavsiya etiladi.

---

## 4. Production — Ubuntu VPS'ga bitta buyruq bilan

1. DNS: domen panelida **A yozuv** `insta` → VPS IP manzili.
2. VPS'da:

```bash
git clone <REPO_URL> avtojavob
cd avtojavob
sudo bash start.sh
```

Skript Instagram app ID va secret'ni so'raydi, qolganini o'zi qiladi:
Python, PostgreSQL (baza + parol), `.env` (maxfiy kalitlar avtomatik), systemd servis,
Nginx, Let's Encrypt SSL va oxirida Meta'ga yoziladigan barcha URL'larni chiqaradi.

Boshqa domen: `sudo DOMAIN=sub.example.com bash start.sh`

Yangilash: `git pull && sudo bash start.sh` — baza va `.env` saqlanib qoladi.

| | |
|---|---|
| Kod | `/opt/avtojavob` |
| Sozlamalar | `/opt/avtojavob/.env` (o'zgartirgach: `systemctl restart avtojavob`) |
| Loglar | `journalctl -u avtojavob -f` |

> `TOKEN_ENC_KEY` ni keyin o'zgartirmang — saqlangan Instagram tokenlari ochilmay qoladi.

---

## Tuzilma

```
app/
  main.py        — sahifalar, OAuth, webhook, Meta callback'lari
  engine.py      — qoidani topish, javob yuborish, dedup, limit, token yangilash
  instagram.py   — Instagram Graph API chaqiruvlari
  models.py      — User, IGAccount, Rule, EventLog, ProcessedEvent
  security.py    — parol hash, token shifrlash, webhook imzosi
  templates/     — interfeys (o'zbekcha)
tests/test_flow.py — to'liq oqim testi (soxta Instagram API bilan)
```

## Keyingi versiyalar uchun g'oyalar

- Obuna va to'lov (Click / Payme), tariflar bo'yicha limitlar
- Direct'da tugmalar (quick replies), ko'p bosqichli flow
- "Follow qilgan bo'lsa yubor" sharti, statistika grafiklari
- Navbat (Redis + worker) — katta yuklama uchun
