"""AI kontent yordamchi: hook'lar, reels ssenariysi va karusel matni.

Manba: biznes haqida ma'lumot (AI sotuvchi prompti), mahsulot katalogi va akkauntning so'nggi post matnlari.
Hozircha Instagram statistikasi (insights) ishlatilmaydi — buning uchun alohida ruxsat kerak.
"""

import json
import re

from .catalog import LANG_NAMES

KINDS = ("hooks", "reels", "carousel")
GOALS = {
    "sell": "sell a product or service — lead the viewer to write in Direct / order",
    "engage": "maximize engagement: comments, shares and saves",
    "expert": "show expertise: teach something useful so people save and follow",
    "story": "tell a short relatable story (problem → turning point → result)",
}
DAILY_LIMIT = 40

HOOK_RULES = """What a strong hook is (first 1-2 seconds / first slide):
- Short: max ~12 words, spoken in under 2 seconds. Concrete, no greetings, no "in this video".
- Uses one trigger: a pain the viewer feels, a surprising number, a mistake, a secret/insider, a contrast (before/after),
  a direct question, a bold claim, or curiosity gap ("nobody tells you…").
- Speaks to ONE specific audience of THIS business, not to everyone.
- Never clickbait that the content can't deliver."""


def _context(business: str, catalog: str, captions: list[str], username: str, product: str) -> str:
    parts = [f"Instagram account: @{username}" if username else ""]
    parts.append("About the business:\n" + (business.strip()[:4000] or "(not provided — infer from the posts and products)"))
    if catalog:
        parts.append("Products:\n" + catalog[:3000])
    if product:
        parts.append("FOCUS PRODUCT for this piece:\n" + product[:800])
    if captions:
        parts.append("Recent post captions of this account (to match its voice and avoid repeating topics):\n"
                     + "\n".join(f"- {c}" for c in captions))
    return "\n\n".join(p for p in parts if p)


# Karusel dizayni: AI shu ro'yxatlardan tanlaydi, chizish brauzerda (Content.tsx) — sifat doim barqaror bo'ladi
PALETTES = {
    "brand": "bold red & white — energetic, sales, promo",
    "midnight": "dark navy-violet with pink accent — premium, tech, night",
    "cream": "warm cream with red accent — cozy, food, handmade, cafe",
    "mint": "fresh mint with dark green — health, cosmetics, eco, medicine",
    "ocean": "deep blue with yellow accent — services, education, finance, trust",
    "sunset": "orange-to-pink gradient — fashion, beauty, lifestyle, young audience",
    "mono": "black & white minimal — luxury, design, clothing, expert",
    "lavender": "soft lavender with purple — kids, gifts, flowers, gentle",
}
FONTS = {
    "modern": "Montserrat — clean and confident (default choice)",
    "bold": "Unbounded — loud, wide, youthful",
    "elegant": "Playfair Display serif — premium, beauty, fashion",
    "playful": "Rubik rounded — friendly, kids, food",
}
DECORS = ("blobs", "grid", "lines", "none")
BGS = ("gradient", "solid", "glow", "split", "mesh", "photo")
BG_IMAGE = re.compile(r"^(https?://[^\s\"'<>]+)?/uploads/[\w.-]+$")
LAYOUTS = ("cover", "text", "list", "steps", "number", "quote", "compare", "photo", "cta")


def system_prompt(kind: str, lang: str, goal: str, *, slides: int = 7, seconds: int = 30, has_photo: bool = False) -> str:
    language = LANG_NAMES.get(lang, "Russian")
    goal_text = GOALS.get(goal, GOALS["sell"])
    head = f"""You are a senior Instagram content strategist and copywriter for small businesses in Central Asia.
Goal of this content: {goal_text}.
Write EVERYTHING the audience sees or hears in {language}. Natural spoken language, no bureaucratic phrases, emojis only where they help.
{HOOK_RULES}
Return ONLY a JSON object, no markdown."""
    if kind == "hooks":
        return head + """
Task: write 10 different hooks for Reels on the given topic, each using a different trigger.
JSON: {"title": "short topic name", "hooks": [{"text": "the hook", "type": "pain|number|mistake|secret|contrast|question|claim|curiosity|story", "why": "one short sentence why it works (in the same language)"}]}"""
    if kind == "reels":
        return head + f"""
Task: write a Reels script of about {seconds} seconds.
- 3 alternative hooks; the script itself starts with the first one.
- Scenes of 2-6 seconds each. For every scene: what is on screen (shot / action, simple enough to film on a phone), the voiceover line, and a SHORT on-screen text (max 6 words).
- Retain attention: a change every few seconds, a payoff before the end, then a clear CTA that fits the goal (e.g. "write PRICE in comments" or "DM us").
- Caption: 2-5 short lines, ends with the CTA. 8-15 relevant hashtags (mix of local and niche, no spaces).
JSON: {{"title": "...", "duration": "{seconds} s", "hooks": ["...", "...", "..."],
"scenes": [{{"time": "0-3 s", "visual": "...", "voice": "...", "text": "..."}}],
"cta": "...", "caption": "...", "hashtags": ["#..."], "tips": ["2-3 short filming tips"]}}"""
    photo = ('\n- The focus product has a photo: use layout "photo" for slide 1 or 2 to show it.' if has_photo else "")
    palettes = "\n".join(f'  - "{k}": {v}' for k, v in PALETTES.items())
    fonts = "\n".join(f'  - "{k}": {v}' for k, v in FONTS.items())
    return head + f"""
Task: write AND design an Instagram carousel of exactly {slides} slides. You are also the art director.
Content rules:
- Slide 1 = the hook (title max 8 words). It must make people swipe.
- Middle slides: ONE idea per slide, logical progression. Title max 7 words, body max 30 words, list items max 8 words each.
- Last slide = CTA that fits the goal (save / share / comment a keyword / DM).
- Caption: 2-5 short lines ending with the CTA. 8-15 hashtags.
Design rules — choose for each slide the layout that fits its content best, and VARY layouts (never 3 identical in a row):
  - "cover": slide 1 only. Huge title, optional short body, one emoji.
  - "text": a title and a paragraph.
  - "list": a title and 3-5 short "items" (tips, reasons, features).
  - "steps": a title and 3-5 sequential "items" (how-to, order process).
  - "number": a striking figure in "big" (e.g. "3×", "87%", "24/7", "289 c.") + title + short body.
  - "quote": a customer review or strong statement in "body", the author/source in "title".
  - "compare": "items" = exactly 2 strings: the bad/before option first, the good/after option second; title above.
  - "photo": product photo + title + short body (only if a photo is available).
  - "cta": last slide only. Title, short body, and the keyword to comment / action in "big" (max 2 words).{photo}
- "highlight": 1-2 words from the title to paint in the accent color.
- "emoji": one fitting emoji per slide or "".
Overall style — pick what fits this business, niche and mood:
- "palette", one of:
{palettes}
- "font", one of:
{fonts}
- "decor", one of: "blobs" (soft circles), "grid" (dot grid), "lines" (diagonal stripes), "none".
- "bg" (background), one of: "gradient" (smooth two-tone), "solid" (flat, minimal), "glow" (dark with a light glow),
  "split" (diagonal two-color split), "mesh" (soft blurred color spots, trendy).
JSON: {{"title": "...", "style": {{"palette": "...", "font": "...", "decor": "...", "bg": "..."}},
"slides": [{{"layout": "...", "title": "...", "body": "...", "items": ["..."], "big": "...", "highlight": "...", "emoji": "..."}}],
"caption": "...", "hashtags": ["#..."]}}"""


def user_prompt(topic: str, business: str, catalog: str, captions: list[str], username: str, product: str) -> str:
    return _context(business, catalog, captions, username, product) + "\n\nTopic / idea from the owner:\n" + (topic or "(choose the best topic yourself)")


LIST_KEY = {"hooks": "hooks", "reels": "scenes", "carousel": "slides"}


def parse_json(text: str, kind: str = "") -> dict:
    """Model javobidan JSON: ``` o'ramlari, oldi-ketidagi matn va satr ichidagi yangi qatorlarga chidamli."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    starts = [i for i in (raw.find("{"), raw.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no json")
    start = min(starts)
    end = raw.rindex("}" if raw[start] == "{" else "]") + 1
    data = json.loads(raw[start:end], strict=False)
    if isinstance(data, list):  # ba'zan model faqat ro'yxatni qaytaradi
        data = {LIST_KEY.get(kind, "items"): data}
    if not isinstance(data, dict):
        raise ValueError("not an object")
    return data


def _s(v, n: int) -> str:
    return str(v or "").strip()[:n]


def _tags(v) -> list[str]:
    items = v if isinstance(v, list) else str(v or "").replace(",", " ").split()
    out = []
    for t in items:
        t = "".join(str(t).split()).strip(",")
        if not t:
            continue
        t = t if t.startswith("#") else "#" + t
        if t not in out:
            out.append(t[:40])
    return out[:20]


def normalize(kind: str, data: dict, slides: int = 7) -> dict:
    """AI javobini xavfsiz va bir xil ko'rinishga keltiradi."""
    title = _s(data.get("title"), 120)
    if kind == "hooks":
        hooks = []
        for h in data.get("hooks") or []:
            h = h if isinstance(h, dict) else {"text": h}
            if _s(h.get("text"), 300):
                hooks.append({"text": _s(h.get("text"), 300), "type": _s(h.get("type"), 20), "why": _s(h.get("why"), 300)})
        if not hooks:
            raise ValueError("no hooks")
        return {"title": title, "hooks": hooks[:15]}
    if kind == "reels":
        scenes = []
        for sc in data.get("scenes") or []:
            if isinstance(sc, dict) and (sc.get("voice") or sc.get("visual")):
                scenes.append({"time": _s(sc.get("time"), 20), "visual": _s(sc.get("visual"), 400),
                               "voice": _s(sc.get("voice"), 600), "text": _s(sc.get("text"), 120)})
        if not scenes:
            raise ValueError("no scenes")
        hooks = [_s(h if not isinstance(h, dict) else h.get("text"), 300) for h in (data.get("hooks") or [])]
        return {"title": title, "duration": _s(data.get("duration"), 20), "hooks": [h for h in hooks if h][:5],
                "scenes": scenes[:20], "cta": _s(data.get("cta"), 300), "caption": _s(data.get("caption"), 2200),
                "hashtags": _tags(data.get("hashtags")), "tips": [_s(x, 200) for x in (data.get("tips") or []) if _s(x, 200)][:5]}
    out = []
    for sl in data.get("slides") or []:
        if not isinstance(sl, dict):
            continue
        items = [_s(x, 160) for x in (sl.get("items") or []) if isinstance(x, (str, int, float)) and _s(x, 160)][:6]
        if not (sl.get("title") or sl.get("body") or items):
            continue
        layout = str(sl.get("layout") or "")
        out.append({"layout": layout if layout in LAYOUTS else "", "title": _s(sl.get("title"), 120),
                    "body": _s(sl.get("body"), 400), "items": items, "big": _s(sl.get("big"), 16),
                    "highlight": _s(sl.get("highlight"), 60), "emoji": _s(sl.get("emoji"), 8)})
    if len(out) < 2:
        raise ValueError("no slides")
    out = out[:max(2, min(slides + 2, 12))]
    # yaroqsiz yoki bo'sh turlarni mazmunga qarab tuzatamiz
    for i, sl in enumerate(out):
        lay = sl["layout"]
        if i == 0 and lay not in ("cover", "photo", "number"):
            lay = "cover"
        elif i == len(out) - 1 and lay != "cta":
            lay = "cta"
        elif lay in ("list", "steps") and len(sl["items"]) < 2 or lay == "compare" and len(sl["items"]) != 2:
            lay = "text"
        elif lay == "number" and not sl["big"]:
            lay = "text"
        elif lay in ("cover", "cta", "") and 0 < i < len(out) - 1:
            lay = "list" if len(sl["items"]) >= 2 else "text"
        sl["layout"] = lay
    st = data.get("style") if isinstance(data.get("style"), dict) else {}
    style = {"palette": st.get("palette") if st.get("palette") in PALETTES else "brand",
             "font": st.get("font") if st.get("font") in FONTS else "modern",
             "decor": st.get("decor") if st.get("decor") in DECORS else "blobs",
             "bg": st.get("bg") if st.get("bg") in BGS else "gradient"}
    img = str(st.get("bg_image") or "")
    if style["bg"] == "photo":
        if BG_IMAGE.match(img):  # faqat serverimizdagi yuklangan rasm
            style["bg_image"] = img
        else:
            style["bg"] = "gradient"
    return {"title": title, "style": style, "slides": out, "caption": _s(data.get("caption"), 2200),
            "hashtags": _tags(data.get("hashtags"))}
