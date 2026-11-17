"""MCP (Model Context Protocol) server — Claude, ChatGPT, Cursor kabi AI yordamchilar ChatFlow'ga ulanadi.

Transport: Streamable HTTP, holatsiz (stateless) — har bir POST /mcp bitta JSON-RPC so'rovi, javob application/json.
Avtorizatsiya: `Authorization: Bearer cf_...` (Sozlamalar → API va MCP'da yaratiladigan shaxsiy kalit).
Asboblar main.py'da @tool bilan ro'yxatdan o'tadi (u yerdagi endpoint funksiyalaridan foydalanadi).
"""
import hashlib
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Callable

SERVER_INFO = {"name": "ChatFlow", "version": "1.0.0"}
PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
INSTRUCTIONS = (
    "ChatFlow — Instagram avtomatlashtirish platformasi (izoh/Direct/story avto-javoblar, AI sotuvchi, CRM). "
    "Most tools take an optional account_id; without it the first connected Instagram account is used — call "
    "list_accounts first if the user has several. Times are UTC ISO-8601. Instagram allows messaging a customer only "
    "within 24 hours after their last message (can_message / window_left_h). Before send_message, show the user the "
    "exact text and recipient and get confirmation."
)
TOKEN_PREFIX = "cf_"
RATE_PER_MIN = 60


@dataclass
class Tool:
    name: str
    title: str
    description: str
    schema: dict
    write: bool
    destructive: bool
    fn: Callable[..., Any]


TOOLS: dict[str, Tool] = {}


def tool(name: str, title: str, description: str, props: dict | None = None, required: list[str] | None = None,
         write: bool = False, destructive: bool = False):
    schema = {"type": "object", "properties": props or {}, "additionalProperties": False}
    if required:
        schema["required"] = required

    def deco(fn):
        TOOLS[name] = Tool(name, title, description, schema, write, destructive, fn)
        return fn
    return deco


# ---------------------------------------------------------------- kalitlar

def new_token() -> tuple[str, str, str]:
    """(kalit, prefiks, xesh). Kalit foydalanuvchiga faqat bir marta ko'rsatiladi."""
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:10], hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


_hits: dict[int, deque] = defaultdict(deque)


def rate_ok(token_id: int) -> bool:
    now = time.monotonic()
    q = _hits[token_id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_PER_MIN:
        return False
    q.append(now)
    return True


# ---------------------------------------------------------------- JSON-RPC

class ToolError(Exception):
    pass


def _result(rid, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _error(rid, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def tools_for(scope: str) -> list[Tool]:
    return [t for t in TOOLS.values() if scope == "write" or not t.write]


def tool_json(t: Tool) -> dict:
    return {"name": t.name, "title": t.title, "description": t.description, "inputSchema": t.schema,
            "annotations": {"title": t.title, "readOnlyHint": not t.write, "destructiveHint": t.destructive,
                            "idempotentHint": not t.write, "openWorldHint": t.name == "send_message"}}


def handle(msg: Any, scope: str, call: Callable[[Tool, dict], Any]) -> dict | None:
    """Bitta JSON-RPC xabari. Bildirishnoma (id yo'q) uchun None qaytadi."""
    import json

    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or not isinstance(msg.get("method"), str):
        return _error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid Request")
    rid, method, params = msg.get("id"), msg["method"], msg.get("params") or {}
    if "id" not in msg:  # notifications/initialized va h.k.
        return None
    if method == "initialize":
        asked = str(params.get("protocolVersion") or "")
        return _result(rid, {"protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
                             "capabilities": {"tools": {"listChanged": False}},
                             "serverInfo": SERVER_INFO, "instructions": INSTRUCTIONS})
    if method == "ping":
        return _result(rid, {})
    if method == "tools/list":
        return _result(rid, {"tools": [tool_json(t) for t in tools_for(scope)]})
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        t = TOOLS.get(name)
        if not t:
            return _error(rid, -32602, f"Unknown tool: {name}")
        if t.write and scope != "write":
            return _result(rid, _tool_error("This API key is read-only. Create a key with write access in ChatFlow → Settings → API & MCP."))
        if not isinstance(args, dict):
            return _error(rid, -32602, "arguments must be an object")
        unknown = set(args) - set(t.schema["properties"])
        if unknown:
            return _result(rid, _tool_error(f"Unknown arguments: {', '.join(sorted(unknown))}"))
        missing = [k for k in t.schema.get("required", []) if args.get(k) in (None, "")]
        if missing:
            return _result(rid, _tool_error(f"Missing required arguments: {', '.join(missing)}"))
        try:
            data = call(t, args)
        except ToolError as e:
            return _result(rid, _tool_error(str(e)))
        text = json.dumps(data, ensure_ascii=False, default=str)
        return _result(rid, {"content": [{"type": "text", "text": text}], "isError": False})
    return _error(rid, -32601, f"Method not found: {method}")


def _tool_error(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}
