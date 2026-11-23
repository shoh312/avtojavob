"""AI sinovi: 5 ta haqiqiy so'rovni to'g'ridan-to'g'ri Claude Haiku'ga yuboradi va narxini ko'rsatadi.

Serverda:  cd /opt/avtojavob && sudo -u avtojavob venv/bin/python -m app.ai_selftest
Gemini'ni ham sinash:  ... -m app.ai_selftest gemini

Admin panelda saqlangan kalit ishlatiladi. Hech kimga xabar yuborilmaydi, hech narsa saqlanmaydi (faqat AI xarajat jadvaliga yoziladi).
5 ta Haiku so'rovi taxminan $0.003 (≈ 3 diram) turadi.
"""

import sys
import time

from sqlalchemy import func, select

from . import aimanager, catalog, content, services
from .db import SessionLocal, init_db
from .models import AiUsage, IGAccount

DEMO_PROMPT = ("Магазин женских сумок в Душанбе. Бежевая и чёрная сумка из натуральной кожи — 289 сомони. "
               "Доставка по городу бесплатно, 1-2 дня. Гарантия 6 месяцев, обмен в течение 14 дней. "
               "Работаем каждый день 9:00-21:00.")

CHATS = [
    ("RU: narx", [{"role": "user", "content": "Здравствуйте! Сколько стоит сумка и есть ли доставка?"}]),
    ("TJ: savol", [{"role": "user", "content": "Салом! Ин сумка чанд пул аст? Ранги сиёҳаш ҳаст?"}]),
    ("UZ: e'tiroz", [{"role": "user", "content": "Assalomu alaykum, sumka narxi qancha?"},
                     {"role": "assistant", "content": "Va alaykum assalom! Sumka 289 somoni, yetkazib berish bepul 😊"},
                     {"role": "user", "content": "Qimmat ekan... chegirma yo'qmi?"}]),
    ("RU: buyurtma", [{"role": "user", "content": "Беру бежевую! Как оформить заказ?"}]),
]


def main() -> None:
    provider = "gemini" if "gemini" in sys.argv[1:] else "claude"
    init_db()
    db = SessionLocal()
    # Faqat shu jarayon ichida: auto rejimidan qat'i nazar tanlangan provayderga yuboramiz
    services.ai_provider = lambda _db: provider
    if not services.ai_available(db):
        print(f"✘ {provider} kaliti admin panelda saqlanmagan (Admin → Platforma sozlamalari → AI).")
        return
    acc = db.scalar(select(IGAccount).where(IGAccount.ai_prompt != "").order_by(IGAccount.id).limit(1)) \
        or db.scalar(select(IGAccount).order_by(IGAccount.id).limit(1))
    if acc is None:
        print("✘ Bazada Instagram akkaunt yo'q — sinov uchun kamida bitta akkaunt kerak.")
        return
    overrides = {} if acc.ai_prompt.strip() else {"prompt": DEMO_PROMPT}
    print(f"Provayder: {provider}  ·  model: {services.claude_model(db) if provider == 'claude' else 'gemini'}")
    print(f"Akkaunt: @{acc.username}  ·  biznes ma'lumoti: {'akkauntniki' if not overrides else 'demo (sumka do`koni)'}"
          f"  ·  mahsulotlar: {len(catalog.active_products(db, acc.id))}\n")
    start_id = db.scalar(select(func.max(AiUsage.id))) or 0

    def last_usage():
        return db.scalar(select(AiUsage).where(AiUsage.id > start_id).order_by(AiUsage.id.desc()).limit(1))

    seen = start_id
    rows = []
    for i, (name, history) in enumerate(CHATS, 1):
        t0 = time.time()
        res = aimanager.simulate(db, acc, history, None, overrides or None)
        u = last_usage()
        fresh = u if u and u.id > seen else None
        seen = u.id if fresh else seen
        reply = (res or {}).get("reply") or "✘ javob yo'q"
        rows.append(fresh)
        _print(i, f"AI sotuvchi · {name}", time.time() - t0, fresh, reply)

    t0 = time.time()
    text, error = services.ai_complete(db, content.system_prompt("hooks", "ru", "sell"),
                                       content.user_prompt("Новые кожаные сумки", overrides.get("prompt") or acc.ai_prompt,
                                                           "", [], acc.username or "", ""),
                                       json_mode=True, max_tokens=4000, task="creative")
    try:
        hooks = content.normalize("hooks", content.parse_json(text or "", "hooks"))["hooks"]
        reply = f"{len(hooks)} ta hook, 1-si: {hooks[0]['text']}"
    except (ValueError, TypeError, KeyError, IndexError):
        reply = f"✘ {error or 'yaroqsiz JSON'}"
    u = last_usage()
    fresh = u if u and u.id > seen else None
    rows.append(fresh)
    _print(5, "AI kontent · 10 ta hook", time.time() - t0, fresh, reply)

    chat = [r for r in rows[:4] if r]
    total = sum(r.cost_micro for r in rows if r) / 1_000_000
    print("-" * 72)
    print(f"Jami 5 so'rov: ${total:.5f}")
    if chat and provider == "claude":
        per = sum(r.cost_micro for r in chat) / len(chat) / 1_000_000
        rate = services.spend_alert_config(db)[1]
        print(f"AI sotuvchi: o'rtacha 1 javob ${per:.5f}  →  1000 javob ≈ ${per * 1000:.2f} ≈ {per * 1000 * rate:.1f} somoni")
    db.close()


def _print(i: int, title: str, sec: float, u, reply: str) -> None:
    print(f"{i}. {title}  ({sec:.1f} s)")
    if u:
        print(f"   {u.model}: {u.input_tokens} kirish + {u.output_tokens} chiqish token = ${u.cost_micro / 1_000_000:.5f}")
    else:
        print("   (token hisobi yozilmadi — so'rov xato bilan tugagan bo'lishi mumkin)")
    print(f"   → {reply[:220]}\n")


if __name__ == "__main__":
    main()
