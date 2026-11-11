"""Ssenariy grafi: tekshiruv (validatsiya) va tayyor shablonlar.

Graf formati (React Flow bilan bir xil):
  {"nodes": [{"id", "type", "position": {"x", "y"}, "data": {...}}],
   "edges": [{"id", "source", "sourceHandle", "target"}]}

Blok turlari va chiqishlari (sourceHandle):
  trigger    data: kind(comment|dm|story_reply|story_mention), keywords, match(contains|exact|any),
                   media_id, media_caption, comment_replies                      -> "out"
  message    data: text, buttons[{id, title, kind(url|flow), url}]              -> "out", "btn:<id>"
  question   data: text, field(phone|email|name|custom), custom_key,
                   validate(any|phone|email|number), error_text                   -> "out"
  condition  data: check(follows|has_tag|has_field), tag, field                  -> "yes", "no"
  action     data: op(add_tag|remove_tag|set_field), tag, field, value           -> "out"
  delay      data: amount, unit(minutes|hours)                                    -> "out"
"""

import re
import uuid

NODE_TYPES = {"trigger", "message", "question", "condition", "action", "delay"}
TRIGGER_KINDS = {"comment", "dm", "story_reply", "story_mention"}
MATCH_MODES = {"contains", "exact", "any"}
FIELD_KEY = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
MAX_NODES = 120


def field_key(data: dict) -> str:
    field = data.get("field") or "custom"
    if field in ("phone", "email", "name"):
        return field
    return (data.get("custom_key") or "").strip().lower()


def validate_graph(graph: dict) -> list[dict]:
    """Xatolar ro'yxati: [{"node": id|None, "code": "..."}]. Kodlar frontendda tarjima qilinadi."""
    errors: list[dict] = []
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return [{"node": None, "code": "bad_graph"}]
    if len(nodes) > MAX_NODES:
        errors.append({"node": None, "code": "too_many_nodes"})

    ids = set()
    triggers = 0
    for n in nodes:
        nid, ntype, d = n.get("id"), n.get("type"), n.get("data") or {}
        if not nid or ntype not in NODE_TYPES:
            errors.append({"node": nid, "code": "bad_node"})
            continue
        ids.add(nid)
        err = lambda code: errors.append({"node": nid, "code": code})  # noqa: E731

        if ntype == "trigger":
            triggers += 1
            kind = d.get("kind")
            if kind not in TRIGGER_KINDS:
                err("trigger_kind")
            match = d.get("match") or "contains"
            if match not in MATCH_MODES:
                err("trigger_match")
            kws = [k for k in (d.get("keywords") or "").split(",") if k.strip()]
            if kind != "story_mention" and match != "any" and not kws:
                err("trigger_keywords")
        elif ntype == "message":
            text = (d.get("text") or "").strip()
            buttons = d.get("buttons") or []
            if not text:
                err("message_text")
            if len(buttons) > 3:
                err("message_buttons_max")
            if len(text) > (640 if buttons else 1000):
                err("message_text_long")
            for b in buttons:
                title = (b.get("title") or "").strip()
                if not title or len(title) > 20:
                    err("button_title")
                if b.get("kind") == "url" and not str(b.get("url") or "").startswith(("https://", "http://")):
                    err("button_url")
        elif ntype == "question":
            if not (d.get("text") or "").strip():
                err("question_text")
            if not FIELD_KEY.match(field_key(d)):
                err("question_field")
        elif ntype == "condition":
            check = d.get("check")
            if check not in ("follows", "has_tag", "has_field"):
                err("condition_check")
            elif check == "has_tag" and not (d.get("tag") or "").strip():
                err("condition_tag")
            elif check == "has_field" and not FIELD_KEY.match((d.get("field") or "").strip().lower()):
                err("condition_field")
        elif ntype == "action":
            op = d.get("op")
            if op not in ("add_tag", "remove_tag", "set_field"):
                err("action_op")
            elif op in ("add_tag", "remove_tag") and not (d.get("tag") or "").strip():
                err("action_tag")
            elif op == "set_field" and not FIELD_KEY.match((d.get("field") or "").strip().lower()):
                err("action_field")
        elif ntype == "delay":
            try:
                amount = int(d.get("amount") or 0)
            except (TypeError, ValueError):
                amount = 0
            minutes = amount * (60 if d.get("unit") == "hours" else 1)
            if minutes < 1 or minutes > 23 * 60:
                err("delay_range")

    if triggers != 1:
        errors.append({"node": None, "code": "trigger_count"})
    for e in edges:
        if e.get("source") not in ids or e.get("target") not in ids:
            errors.append({"node": None, "code": "bad_edge"})
            break
    return errors


def trigger_of(graph: dict) -> dict | None:
    for n in graph.get("nodes") or []:
        if n.get("type") == "trigger":
            return n
    return None


# ---------------------------------------------------------------- shablonlar

def _id() -> str:
    return uuid.uuid4().hex[:8]


T = {
    "price_name": {"tj": "Нарх пурсиданд", "ru": "Спросили цену", "uz": "Narx so'raganlar", "en": "Price requests"},
    "price_desc": {"tj": "Ба шарҳ «нарх» — ҷавоб дар шарҳ ва паём дар Direct бо тугмаҳо",
                   "ru": "Комментарий «цена» → ответ под постом и сообщение в Direct с кнопками",
                   "uz": "Izohda «narx» → izohga javob va tugmali Direct xabar",
                   "en": "Comment “price” → public reply and a Direct message with buttons"},
    "price_kw": {"tj": "нарх, чанд, narx, цена", "ru": "цена, сколько, прайс, price",
                 "uz": "narx, qancha, нарх, цена", "en": "price, cost, how much"},
    "price_reply": {"tj": "Ба Direct навиштем 📩\nМаълумот дар Direct ✅",
                    "ru": "Написали вам в Direct 📩\nОтветили в Direct ✅",
                    "uz": "Direct'ga yozdik 📩\nMa'lumot Direct'da ✅",
                    "en": "Sent you a DM 📩\nCheck your Direct ✅"},
    "price_text": {"tj": "Салом, {username}! 👋 Нархҳо ва каталог дар зер:",
                   "ru": "Привет, {username}! 👋 Цены и каталог ниже:",
                   "uz": "Salom, {username}! 👋 Narxlar va katalog quyida:",
                   "en": "Hi {username}! 👋 Prices and catalog below:"},
    "catalog": {"tj": "Каталог", "ru": "Каталог", "uz": "Katalog", "en": "Catalog"},
    "order": {"tj": "Фармоиш додан", "ru": "Заказать", "uz": "Buyurtma berish", "en": "Order"},

    "gift_name": {"tj": "Тӯҳфа + санҷиши обуна", "ru": "Подарок + проверка подписки",
                  "uz": "Sovg'a + obuna tekshiruvi", "en": "Gift + follow check"},
    "gift_desc": {"tj": "Ҳавола танҳо ба обуначиён фиристода мешавад",
                  "ru": "Ссылка на подарок — только подписчикам",
                  "uz": "Sovg'a havolasi faqat obunachilarga beriladi",
                  "en": "The gift link goes to followers only"},
    "gift_kw": {"tj": "тӯҳфа, совға, gift", "ru": "подарок, хочу, gift", "uz": "sovg'a, sovga, gift",
                "en": "gift, free, want"},
    "gift_text": {"tj": "Салом, {username}! 🎁 Тӯҳфаи шумо омода аст.",
                  "ru": "Привет, {username}! 🎁 Ваш подарок готов.",
                  "uz": "Salom, {username}! 🎁 Sovg'angiz tayyor.",
                  "en": "Hi {username}! 🎁 Your gift is ready."},
    "get": {"tj": "Гирифтан", "ru": "Получить", "uz": "Olish", "en": "Get it"},
    "gift_ok": {"tj": "Ташаккур барои обуна! Инак тӯҳфаи шумо 👇", "ru": "Спасибо за подписку! Держите подарок 👇",
                "uz": "Obuna uchun rahmat! Mana sovg'angiz 👇", "en": "Thanks for following! Here’s your gift 👇"},
    "download": {"tj": "Боргирӣ", "ru": "Скачать", "uz": "Yuklab olish", "en": "Download"},
    "gift_no": {"tj": "Аввал ба саҳифаи мо обуна шавед, баъд тугмаро пахш кунед 🙏",
                "ru": "Сначала подпишитесь на нашу страницу, затем нажмите кнопку 🙏",
                "uz": "Avval sahifamizga obuna bo'ling, keyin tugmani bosing 🙏",
                "en": "Please follow our page first, then tap the button 🙏"},
    "followed": {"tj": "Обуна шудам ✅", "ru": "Я подписался ✅", "uz": "Obuna bo'ldim ✅", "en": "I followed ✅"},

    "lead_name": {"tj": "Ҷамъоварии рақами телефон", "ru": "Сбор телефона (лид)",
                  "uz": "Telefon raqam yig'ish (lid)", "en": "Collect phone (lead)"},
    "lead_desc": {"tj": "Рақами телефонро мепурсад, нигоҳ медорад ва барчасп мегузорад",
                  "ru": "Спрашивает телефон, сохраняет и ставит тег",
                  "uz": "Telefon raqamni so'raydi, saqlaydi va teg qo'yadi",
                  "en": "Asks for a phone number, saves it and adds a tag"},
    "lead_kw": {"tj": "фармоиш, заказ, buyurtma", "ru": "заказ, купить, хочу", "uz": "buyurtma, olaman, заказ",
                "en": "order, buy"},
    "lead_q": {"tj": "Барои фармоиш рақами телефони худро нависед 📞",
               "ru": "Чтобы оформить заказ, напишите ваш номер телефона 📞",
               "uz": "Buyurtma uchun telefon raqamingizni yozing 📞",
               "en": "To place an order, please send your phone number 📞"},
    "lead_err": {"tj": "Лутфан рақами дурустро нависед, масалан +992 90 123 45 67",
                 "ru": "Пожалуйста, напишите корректный номер, например +7 900 123-45-67",
                 "uz": "Iltimos, to'g'ri raqam yozing, masalan +998 90 123 45 67",
                 "en": "Please send a valid number, e.g. +1 555 123 4567"},
    "lead_ok": {"tj": "Ташаккур! Менеҷер ба зудӣ занг мезанад ✅", "ru": "Спасибо! Менеджер скоро перезвонит ✅",
                "uz": "Rahmat! Menejer tez orada qo'ng'iroq qiladi ✅", "en": "Thanks! A manager will call you soon ✅"},

    "story_name": {"tj": "Ҷавоб ба сторис", "ru": "Ответ на сторис", "uz": "Story'ga javob", "en": "Story reply"},
    "story_desc": {"tj": "Ба ҳар касе, ки ба сторис ҷавоб медиҳад", "ru": "Каждому, кто ответил на сторис",
                   "uz": "Story'ga javob yozgan har bir kishiga", "en": "Everyone who replies to your story"},
    "story_text": {"tj": "Ташаккур барои ҷавоб! 🔥 Ин ҳам пешниҳоди махсус:",
                   "ru": "Спасибо за ответ! 🔥 Специальное предложение для вас:",
                   "uz": "Javobingiz uchun rahmat! 🔥 Siz uchun maxsus taklif:",
                   "en": "Thanks for the reply! 🔥 A special offer for you:"},
    "offer": {"tj": "Пешниҳод", "ru": "Предложение", "uz": "Taklif", "en": "Offer"},
}


def _t(key: str, lang: str) -> str:
    return T[key].get(lang) or T[key]["en"]


def _node(ntype: str, x: int, y: int, data: dict) -> dict:
    return {"id": _id(), "type": ntype, "position": {"x": x, "y": y}, "data": data}


def _edge(src: dict, dst: dict, handle: str = "out") -> dict:
    return {"id": _id(), "source": src["id"], "sourceHandle": handle, "target": dst["id"]}


def _btn(title: str, kind: str = "flow", url: str = "") -> dict:
    return {"id": _id(), "title": title, "kind": kind, "url": url}


def blank_graph() -> dict:
    trig = _node("trigger", 0, 0, {"kind": "comment", "keywords": "", "match": "contains",
                                   "media_id": None, "media_caption": "", "comment_replies": ""})
    return {"nodes": [trig], "edges": []}


def build_template(key: str, lang: str) -> tuple[str, dict]:
    t = lambda k: _t(k, lang)  # noqa: E731
    if key == "price":
        trig = _node("trigger", 0, 0, {"kind": "comment", "keywords": t("price_kw"), "match": "contains",
                                       "media_id": None, "media_caption": "", "comment_replies": t("price_reply")})
        msg = _node("message", 380, 0, {"text": t("price_text"), "buttons": [
            _btn(t("catalog"), "url", "https://example.com"), _btn(t("order"), "url", "https://t.me/")]})
        return t("price_name"), {"nodes": [trig, msg], "edges": [_edge(trig, msg)]}

    if key == "gift":
        trig = _node("trigger", 0, 60, {"kind": "comment", "keywords": t("gift_kw"), "match": "contains",
                                        "media_id": None, "media_caption": "", "comment_replies": t("price_reply")})
        get = _btn(t("get"))
        msg = _node("message", 380, 40, {"text": t("gift_text"), "buttons": [get]})
        cond = _node("condition", 760, 40, {"check": "follows"})
        ok = _node("message", 1140, -80, {"text": t("gift_ok"), "buttons": [
            _btn(t("download"), "url", "https://example.com/gift.pdf")]})
        again = _btn(t("followed"))
        no = _node("message", 1140, 200, {"text": t("gift_no"), "buttons": [again]})
        return t("gift_name"), {"nodes": [trig, msg, cond, ok, no], "edges": [
            _edge(trig, msg), _edge(msg, cond, f"btn:{get['id']}"), _edge(cond, ok, "yes"),
            _edge(cond, no, "no"), _edge(no, cond, f"btn:{again['id']}")]}

    if key == "lead":
        trig = _node("trigger", 0, 0, {"kind": "dm", "keywords": t("lead_kw"), "match": "contains",
                                       "media_id": None, "media_caption": "", "comment_replies": ""})
        q = _node("question", 380, 0, {"text": t("lead_q"), "field": "phone", "custom_key": "",
                                       "validate": "phone", "error_text": t("lead_err")})
        tag = _node("action", 760, 0, {"op": "add_tag", "tag": "lead"})
        ok = _node("message", 1140, 0, {"text": t("lead_ok"), "buttons": []})
        return t("lead_name"), {"nodes": [trig, q, tag, ok], "edges": [
            _edge(trig, q), _edge(q, tag), _edge(tag, ok)]}

    if key == "story":
        trig = _node("trigger", 0, 0, {"kind": "story_reply", "keywords": "", "match": "any",
                                       "media_id": None, "media_caption": "", "comment_replies": ""})
        msg = _node("message", 380, 0, {"text": t("story_text"), "buttons": [
            _btn(t("offer"), "url", "https://example.com")]})
        return t("story_name"), {"nodes": [trig, msg], "edges": [_edge(trig, msg)]}

    raise KeyError(key)


TEMPLATE_KEYS = ("price", "gift", "lead", "story")


def list_templates(lang: str) -> list[dict]:
    icons = {"price": "tag", "gift": "gift", "lead": "phone", "story": "circle-dot"}
    return [{"key": k, "icon": icons[k], "name": _t(f"{k}_name", lang), "description": _t(f"{k}_desc", lang)}
            for k in TEMPLATE_KEYS]
