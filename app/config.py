import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_URL = os.getenv("APP_URL", "http://localhost:8000").rstrip("/")
    APP_NAME = "ChatFlow"
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    TOKEN_ENC_KEY = os.getenv("TOKEN_ENC_KEY", "")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data.db")

    IG_APP_ID = os.getenv("IG_APP_ID", "")
    IG_APP_SECRET = os.getenv("IG_APP_SECRET", "")
    FB_APP_SECRET = os.getenv("FB_APP_SECRET", "")
    WEBHOOK_VERIFY_TOKEN = os.getenv("WEBHOOK_VERIFY_TOKEN", "")

    GRAPH_VERSION = os.getenv("GRAPH_VERSION", "v23.0")
    HOURLY_SEND_LIMIT = int(os.getenv("HOURLY_SEND_LIMIT", "180"))
    ADMIN_EMAILS = os.getenv("ADMIN_EMAILS", "")
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))

    @property
    def redirect_uri(self) -> str:
        return f"{self.APP_URL}/instagram/callback"

    @property
    def ig_ready(self) -> bool:
        return bool(self.IG_APP_ID and self.IG_APP_SECRET)


settings = Settings()
