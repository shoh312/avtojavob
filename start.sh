#!/usr/bin/env bash
# =====================================================================
#  AvtoJavob — Ubuntu VPS uchun to'liq o'rnatish va yangilash skripti
#
#  Birinchi marta:
#     git clone <REPO_URL> avtojavob && cd avtojavob && sudo bash start.sh
#  Yangilash (kod o'zgarganda):
#     cd avtojavob && git pull && sudo bash start.sh
#
#  Ixtiyoriy o'zgaruvchilar:
#     DOMAIN=insta.rahnamo.tj  IG_APP_ID=...  IG_APP_SECRET=...  CERTBOT_EMAIL=you@mail.com
# =====================================================================
set -euo pipefail
trap 'echo -e "\033[1;31m✘ Xato: start.sh ${LINENO}-qatorda to‘xtadi (buyruq: ${BASH_COMMAND})\033[0m" >&2' ERR

DOMAIN="${DOMAIN:-insta.rahnamo.tj}"
APP_DIR=/opt/avtojavob
APP_USER=avtojavob
SERVICE=avtojavob
DB_NAME=avtojavob
DB_USER=avtojavob
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/.env"
WEBROOT=/var/www/html

G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; B='\033[1;36m'; N='\033[0m'
step() { echo -e "\n${B}==> $*${N}"; }
ok()   { echo -e "${G}✔ $*${N}"; }
warn() { echo -e "${Y}⚠ $*${N}"; }
die()  { echo -e "${R}✘ $*${N}"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Root sifatida ishga tushiring:  sudo bash start.sh"
[ -f "$SRC_DIR/app/main.py" ] || die "start.sh loyiha papkasida turishi kerak (app/main.py topilmadi)."
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "Bu skript Ubuntu uchun yozilgan (sizda: ${PRETTY_NAME:-?}). Davom etyapman..."

# ---------------------------------------------------------------------
step "1/8  Kerakli paketlarni o'rnatish"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx certbot postgresql \
    rsync curl openssl dnsutils iproute2 software-properties-common >/dev/null

PY=python3
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    warn "Python 3.10+ kerak, python3.11 o'rnatilmoqda..."
    add-apt-repository -y ppa:deadsnakes/ppa >/dev/null
    apt-get update -qq
    apt-get install -y -qq python3.11 python3.11-venv >/dev/null
    PY=python3.11
fi
ok "Paketlar tayyor ($($PY --version))"

# ---------------------------------------------------------------------
step "2/8  Kodni $APP_DIR ga joylash"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
    rsync -a --delete \
        --exclude '.git' --exclude 'venv' --exclude '.env' --exclude '*.db' \
        --exclude '__pycache__' --exclude '.pytest_cache' --exclude '*.log' \
        "$SRC_DIR"/ "$APP_DIR"/
fi
ok "Kod ko'chirildi"

# ---------------------------------------------------------------------
step "3/8  PostgreSQL bazasi"
systemctl enable --now postgresql >/dev/null 2>&1
pg() { (cd /tmp && runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtAc "$1"); }

NEW_DB_PASS=""
if [ ! -f "$ENV_FILE" ]; then
    NEW_DB_PASS="$(openssl rand -hex 16)"
    if pg "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        pg "ALTER USER $DB_USER WITH PASSWORD '$NEW_DB_PASS';"
    else
        pg "CREATE USER $DB_USER WITH PASSWORD '$NEW_DB_PASS';"
    fi
fi
pg "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || (cd /tmp && runuser -u postgres -- createdb -O "$DB_USER" "$DB_NAME")
ok "Baza: $DB_NAME"

# ---------------------------------------------------------------------
step "4/8  Sozlamalar (.env)"
set_env() {
    local key="$1" val="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
        echo "${key}=${val}" >> "$ENV_FILE"
    fi
}
get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }

if [ ! -f "$ENV_FILE" ]; then
    cp "$APP_DIR/.env.example" "$ENV_FILE"
    set_env SECRET_KEY "$(openssl rand -base64 48 | tr -d '\n/+=')"
    set_env TOKEN_ENC_KEY "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n')"
    set_env WEBHOOK_VERIFY_TOKEN "$(openssl rand -hex 16)"
    set_env DATABASE_URL "postgresql+psycopg://${DB_USER}:${NEW_DB_PASS}@localhost:5432/${DB_NAME}"
    ok "Yangi .env yaratildi (maxfiy kalitlar avtomatik)"
fi
set_env APP_URL "https://${DOMAIN}"

# Instagram kalitlari: muhit o'zgaruvchisi > mavjud .env > so'rash
[ -n "${IG_APP_ID:-}" ] && set_env IG_APP_ID "$IG_APP_ID"
[ -n "${IG_APP_SECRET:-}" ] && set_env IG_APP_SECRET "$IG_APP_SECRET"
if [ -z "$(get_env IG_APP_ID)" ] || [ -z "$(get_env IG_APP_SECRET)" ]; then
    if [ -t 0 ]; then
        echo -e "${Y}Meta → MyAgent → Instagram → API setup with Instagram login bo'limidagi qiymatlar:${N}"
        read -rp "  Instagram app ID: " _id
        read -rsp "  Instagram app secret (ko'rinmaydi): " _sec; echo
        [ -n "$_id" ] && set_env IG_APP_ID "$_id"
        [ -n "$_sec" ] && set_env IG_APP_SECRET "$_sec"
    fi
fi
[ -n "$(get_env IG_APP_ID)" ] && [ -n "$(get_env IG_APP_SECRET)" ] \
    && ok "Instagram kalitlari bor" \
    || warn "IG_APP_ID / IG_APP_SECRET hali yo'q — keyin: sudo nano $ENV_FILE  va  sudo systemctl restart $SERVICE"
[ -n "${ADMIN_EMAILS:-}" ] && set_env ADMIN_EMAILS "$ADMIN_EMAILS"
if [ -z "$(get_env ADMIN_EMAILS)" ] && [ -t 0 ]; then
    read -rp "  Admin panel uchun email (ChatFlow'dagi hisobingiz): " _adm
    [ -n "$_adm" ] && set_env ADMIN_EMAILS "$_adm"
fi
[ -n "$(get_env ADMIN_EMAILS)" ] && ok "Admin: $(get_env ADMIN_EMAILS)"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------
step "5/8  Python muhiti va kutubxonalar"
if [ -x "$APP_DIR/venv/bin/python" ] && ! "$APP_DIR/venv/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    rm -rf "$APP_DIR/venv"
fi
[ -x "$APP_DIR/venv/bin/python" ] || $PY -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Kutubxonalar o'rnatildi"

# ---------------------------------------------------------------------
step "6/8  Servis (systemd)"
systemctl stop "$SERVICE" >/dev/null 2>&1 || true
sleep 2
PORT=8000
while ss -ltn "sport = :$PORT" | grep -q LISTEN; do PORT=$((PORT + 1)); done

cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=AvtoJavob - Instagram auto-reply
After=network.target postgresql.service
Wants=postgresql.service

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${APP_DIR}/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${PORT} --workers 1 --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

for _ in $(seq 1 30); do
    curl -fs -o /dev/null "http://127.0.0.1:${PORT}/privacy" && break
    sleep 1
done
if curl -fs -o /dev/null "http://127.0.0.1:${PORT}/privacy"; then
    ok "Ilova ishlayapti (port $PORT)"
else
    journalctl -u "$SERVICE" -n 40 --no-pager
    die "Ilova ishga tushmadi — yuqoridagi logga qarang."
fi

# ---------------------------------------------------------------------
step "7/8  Nginx va SSL (HTTPS)"
NGX="/etc/nginx/sites-available/${SERVICE}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
mkdir -p "$WEBROOT"

write_nginx() {
    if [ -f "$CERT" ]; then
        cat > "$NGX" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${DOMAIN};
    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
    else
        cat > "$NGX" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    fi
    ln -sf "$NGX" "/etc/nginx/sites-enabled/${SERVICE}"
    nginx -t -q && systemctl reload nginx
}

systemctl enable --now nginx >/dev/null 2>&1
write_nginx

if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null && ok "Firewall: 80/443 ochildi"
fi

SSL_OK=0
if [ -f "$CERT" ]; then
    SSL_OK=1
else
    SERVER_IP="$(curl -4 -fs --max-time 10 https://api.ipify.org || true)"
    DNS_IP="$(dig +short A "$DOMAIN" 2>/dev/null | grep -E "^[0-9.]+$" | tail -1 || true)"
    if [ -z "$DNS_IP" ]; then
        warn "DNS: $DOMAIN hali hech qayerga yo'naltirilmagan."
    elif [ -n "$SERVER_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
        warn "DNS: $DOMAIN -> $DNS_IP, lekin bu serverning IP manzili $SERVER_IP."
    fi
    if [ -n "$DNS_IP" ]; then
        EMAIL_ARGS=(--register-unsafely-without-email)
        [ -n "${CERTBOT_EMAIL:-}" ] && EMAIL_ARGS=(-m "$CERTBOT_EMAIL")
        # Avval HTTP orqali domen shu serverga kelishini tekshiramiz
        echo "ok-${SERVICE}" > "$WEBROOT/.well-known-test" 2>/dev/null || true
        mkdir -p "$WEBROOT/.well-known/acme-challenge"
        echo "ok" > "$WEBROOT/.well-known/acme-challenge/avtojavob-test"
        if ! curl -fs --max-time 10 "http://${DOMAIN}/.well-known/acme-challenge/avtojavob-test" | grep -q ok; then
            warn "http://${DOMAIN}/.well-known/... bu serverga yetib kelmayapti (DNS yoki boshqa nginx sozlamasi)."
        fi
        rm -f "$WEBROOT/.well-known/acme-challenge/avtojavob-test" "$WEBROOT/.well-known-test"

        if CB_OUT="$(certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos \
                "${EMAIL_ARGS[@]}" --deploy-hook "systemctl reload nginx" 2>&1)"; then
            SSL_OK=1
            write_nginx
        else
            echo "$CB_OUT" | tail -15
        fi
    fi
fi
if [ "$SSL_OK" = 1 ]; then
    ok "HTTPS ishlayapti, sertifikat avtomatik yangilanadi"
else
    warn "SSL olinmadi. DNS'da A yozuv qo'shing:  insta  ->  ${SERVER_IP:-SERVER_IP}"
    warn "DNS tarqalgach (5-30 daqiqa) qayta ishga tushiring:  sudo bash start.sh"
fi

# ---------------------------------------------------------------------
step "8/8  Tayyor!"
VT="$(get_env WEBHOOK_VERIFY_TOKEN)"
cat <<EOF

  Sayt:            https://${DOMAIN}

  ── Meta (developers.facebook.com → MyAgent) ga yoziladigan qiymatlar ──
  Webhook Callback URL : https://${DOMAIN}/webhook
  Verify token         : ${VT}
  Webhook maydonlari   : comments, messages  (Subscribe)
  OAuth Redirect URI   : https://${DOMAIN}/instagram/callback
  Deauthorize URL      : https://${DOMAIN}/deauthorize
  Data deletion URL    : https://${DOMAIN}/data-deletion
  Privacy Policy URL   : https://${DOMAIN}/privacy
  Terms of Service URL : https://${DOMAIN}/terms

  ── Foydali buyruqlar ──
  Loglar         : journalctl -u ${SERVICE} -f
  Qayta ishga    : systemctl restart ${SERVICE}
  Sozlamalar     : nano ${ENV_FILE}
  Yangilash      : git pull && sudo bash start.sh

EOF
