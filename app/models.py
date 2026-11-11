import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    # SQLite bilan muammo bo'lmasligi uchun naive UTC saqlaymiz
    return datetime.now(timezone.utc).replace(tzinfo=None)


LANGS = ("tj", "ru", "uz", "en")
EMPTY_GRAPH = '{"nodes": [], "edges": []}'


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    lang: Mapped[str] = mapped_column(String(5), default="ru")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Tarif: trial | pro | business. Muddati tugasa — avtomatika to'xtaydi
    plan: Mapped[str] = mapped_column(String(20), default="trial")
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    google_sub: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
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
    # AI yordamchi: hech bir ssenariy mos kelmagan Direct xabarlarga javob beradi
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_prompt: Mapped[str] = mapped_column(Text, default="")
    # Telegram xabarnomalar (foydalanuvchining o'z boti)
    tg_bot_token_enc: Mapped[str] = mapped_column(Text, default="")
    tg_chat_id: Mapped[str] = mapped_column(String(64), default="")
    tg_chat_title: Mapped[str] = mapped_column(String(255), default="")
    tg_notify_leads: Mapped[bool] = mapped_column(Boolean, default=True)
    tg_notify_inbox: Mapped[bool] = mapped_column(Boolean, default=False)
    # CRM bosqichlari (bo'sh — standart bosqichlar egasining tilida)
    crm_stages_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="accounts")
    flows: Mapped[list["Flow"]] = relationship(back_populates="account", cascade="all, delete-orphan",
                                               order_by="Flow.id")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Flow(Base):
    """Vizual ssenariy: React Flow formatidagi graf (nodes + edges)."""

    __tablename__ = "flows"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    graph_json: Mapped[str] = mapped_column(Text, default=EMPTY_GRAPH)
    # Tez qidirish uchun trigger turi grafdan nusxalanadi: comment | dm | story_reply | story_mention
    trigger_kind: Mapped[str] = mapped_column(String(20), default="", index=True)
    runs: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[IGAccount] = relationship(back_populates="flows")
    stats: Mapped[list["NodeStat"]] = relationship(cascade="all, delete-orphan")
    sessions: Mapped[list["FlowSession"]] = relationship(cascade="all, delete-orphan")
    jobs: Mapped[list["ScheduledJob"]] = relationship(cascade="all, delete-orphan")

    @property
    def graph(self) -> dict:
        try:
            data = json.loads(self.graph_json or EMPTY_GRAPH)
        except ValueError:
            data = {}
        return {"nodes": data.get("nodes") or [], "edges": data.get("edges") or []}

    @graph.setter
    def graph(self, value: dict) -> None:
        self.graph_json = json.dumps(value, ensure_ascii=False)


class Contact(Base):
    """Instagram'da biz bilan muloqot qilgan odam (IGSID bo'yicha)."""

    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("account_id", "igsid", name="uq_contact_account_igsid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    igsid: Mapped[str] = mapped_column(String(64))
    username: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    fields_json: Mapped[str] = mapped_column(Text, default="{}")
    follows: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Instagram 24 soat qoidasi: shu vaqtdan keyin 24 soat ichida xabar yuborish mumkin
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    profile_checked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Jonli chat
    bot_paused_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    unread: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    last_message_preview: Mapped[str] = mapped_column(String(255), default="")
    # CRM
    stage: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    deal_value: Mapped[int] = mapped_column(Integer, default=0)
    stage_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    account: Mapped[IGAccount] = relationship(back_populates="contacts")
    sessions: Mapped[list["FlowSession"]] = relationship(cascade="all, delete-orphan")
    jobs: Mapped[list["ScheduledJob"]] = relationship(cascade="all, delete-orphan")

    @property
    def tags(self) -> list[str]:
        try:
            return [str(t) for t in json.loads(self.tags_json or "[]")]
        except ValueError:
            return []

    @tags.setter
    def tags(self, value: list[str]) -> None:
        clean = []
        for t in value:
            t = str(t).strip()[:40]
            if t and t not in clean:
                clean.append(t)
        self.tags_json = json.dumps(clean[:50], ensure_ascii=False)

    @property
    def fields(self) -> dict:
        try:
            data = json.loads(self.fields_json or "{}")
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    @fields.setter
    def fields(self, value: dict) -> None:
        self.fields_json = json.dumps(value, ensure_ascii=False)

    def can_message(self) -> bool:
        return bool(self.last_inbound_at and utcnow() - self.last_inbound_at < timedelta(hours=24))

    def bot_paused(self) -> bool:
        return bool(self.bot_paused_until and self.bot_paused_until > utcnow())


class FlowSession(Base):
    """Kontakt savolga javob kutayotgan holat (Savol bloki)."""

    __tablename__ = "flow_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), unique=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class ScheduledJob(Base):
    """Kutish bloki: belgilangan vaqtda ssenariyni davom ettirish."""

    __tablename__ = "scheduled_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(64))
    run_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class NodeStat(Base):
    """Blok statistikasi: sent, clicked:<tugma>, yes, no, answered..."""

    __tablename__ = "node_stats"
    __table_args__ = (UniqueConstraint("flow_id", "node_id", "key", name="uq_node_stat"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(64))
    key: Mapped[str] = mapped_column(String(80))
    count: Mapped[int] = mapped_column(Integer, default=0)


class ProcessedEvent(Base):
    """Meta webhook'ni qayta yuborsa, bir hodisaga ikki marta javob bermaslik uchun."""

    __tablename__ = "processed_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(160), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


SEND_KINDS = ("comment_reply", "private_reply", "dm_reply", "ai_reply", "agent_reply", "broadcast")


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("ig_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # eski versiyadan qolgan
    flow_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    contact_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(32))
    username: Mapped[str] = mapped_column(String(120), default="")
    incoming: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class PlanGrant(Base):
    """Admin tomonidan berilgan tarif (qo'lda to'lov) — daromad statistikasi shu yerdan."""

    __tablename__ = "plan_grants"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan: Mapped[str] = mapped_column(String(20))
    days: Mapped[int] = mapped_column(Integer, default=30)
    amount: Mapped[int] = mapped_column(Integer, default=0)  # somoni
    note: Mapped[str] = mapped_column(String(255), default="")
    granted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class Message(Base):
    """Jonli chat tarixi: kiruvchi va chiquvchi xabarlar."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    direction: Mapped[str] = mapped_column(String(4))  # in | out
    # user | comment | button | story | flow | ai | agent | broadcast
    source: Mapped[str] = mapped_column(String(20), default="user")
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text, default="")
    buttons_json: Mapped[str] = mapped_column(Text, default="[]")
    tag: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="running")  # running | done | limited | interrupted
    total: Mapped[int] = mapped_column(Integer, default=0)
    sent: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Note(Base):
    """CRM izohlari va bosqich o'zgarishlari tarixi."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("ig_accounts.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="note")  # note | stage
    author: Mapped[str] = mapped_column(String(120), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
