import json
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    # SQLite bilan muammo bo'lmasligi uchun naive UTC saqlaymiz
    return datetime.now(timezone.utc).replace(tzinfo=None)


DEFAULT_GATE_BUTTON = "Havolani olish"
DEFAULT_FOLLOW_BUTTON = "Obuna bo'ldim ✅"
DEFAULT_NOT_FOLLOWING = "Havolani olish uchun avval sahifamizga obuna bo'ling, keyin «Obuna bo'ldim» tugmasini bosing 🙏"

TRIGGERS = {
    "comment": "Izoh (comment)",
    "dm": "Direct xabar",
}
MATCH_MODES = {
    "contains": "Matnda kalit so'z bo'lsa",
    "exact": "Matn aynan kalit so'zga teng bo'lsa",
    "any": "Har qanday matn",
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    accounts: Mapped[list["IGAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", order_by="IGAccount.id"
    )


class IGAccount(Base):
    __tablename__ = "ig_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Instagram professional account ID — webhook'dagi entry.id shu
    ig_user_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # App-scoped ID (/me -> id) — data deletion so'rovlarida keladi
    scoped_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    username: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    picture_url: Mapped[str] = mapped_column(Text, default="")
    access_token_enc: Mapped[str] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="accounts")
    rules: Mapped[list["Rule"]] = relationship(
        back_populates="account", cascade="all, delete-orphan", order_by="Rule.id"
    )


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    trigger: Mapped[str] = mapped_column(String(16), default="comment")
    keywords: Mapped[str] = mapped_column(Text, default="")
    match_mode: Mapped[str] = mapped_column(String(16), default="contains")
    # None = barcha postlar
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_caption: Mapped[str] = mapped_column(String(255), default="")
    # Har bir qator — alohida variant (tasodifiy tanlanadi, spamga o'xshamasligi uchun)
    comment_replies: Mapped[str] = mapped_column(Text, default="")
    dm_text: Mapped[str] = mapped_column(Text, default="")
    # Havola tugmalari: [{"title": "...", "url": "https://..."}] (maks. 3)
    buttons_json: Mapped[str] = mapped_column(Text, default="[]")
    # Obuna tekshiruvi
    follow_gate: Mapped[bool] = mapped_column(Boolean, default=False)
    gate_button: Mapped[str] = mapped_column(String(40), default=DEFAULT_GATE_BUTTON)
    reward_text: Mapped[str] = mapped_column(Text, default="")
    not_following_text: Mapped[str] = mapped_column(Text, default=DEFAULT_NOT_FOLLOWING)
    follow_button: Mapped[str] = mapped_column(String(40), default=DEFAULT_FOLLOW_BUTTON)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[IGAccount] = relationship(back_populates="rules")

    @property
    def buttons(self) -> list[dict]:
        try:
            data = json.loads(self.buttons_json or "[]")
        except ValueError:
            return []
        return [b for b in data if isinstance(b, dict) and b.get("title") and b.get("url")][:3]

    @buttons.setter
    def buttons(self, value: list[dict]) -> None:
        self.buttons_json = json.dumps(value[:3], ensure_ascii=False)

    @property
    def keyword_list(self) -> list[str]:
        return [k.strip() for k in self.keywords.split(",") if k.strip()]

    @property
    def reply_variants(self) -> list[str]:
        return [line.strip() for line in self.comment_replies.splitlines() if line.strip()]


class ProcessedEvent(Base):
    """Meta webhook'ni qayta yuborsa, bir hodisaga ikki marta javob bermaslik uchun."""

    __tablename__ = "processed_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(160), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


SEND_KINDS = ("comment_reply", "private_reply", "dm_reply", "gate_pass", "gate_fail")


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("ig_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(32))
    username: Mapped[str] = mapped_column(String(120), default="")
    incoming: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
