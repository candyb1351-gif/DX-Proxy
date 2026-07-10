#!/bin/bash
# Shared functions used by both `dx` (console) and the HTTP panel
# (panel calls `dx` as a subprocess, so this file is the single
# source of truth for how state is read/written and how reload works).

DATA_DIR="${DATA_DIR:-/data}"
USERS_FILE="$DATA_DIR/users.json"
SETTINGS_FILE="$DATA_DIR/settings.json"
AUTH_FILE="$DATA_DIR/panel_auth.json"
MTG_CONFIG="/etc/mtg/config.toml"
RELOAD_FLAG="$DATA_DIR/.reload"

mkdir -p "$DATA_DIR" /etc/mtg

# ---------- apply Railway env variables ----------
apply_railway_env() {
  if [ -f "$SETTINGS_FILE" ]; then
    local current_host current_port current_domain
    current_host=$(jq -r '.proxy_host // ""' "$SETTINGS_FILE")
    current_port=$(jq -r '.proxy_port // ""' "$SETTINGS_FILE")
    current_domain=$(jq -r '.fake_tls_domain // ""' "$SETTINGS_FILE")

    local next_host="$current_host"
    local next_port="$current_port"
    local next_domain="$current_domain"

    if [ -n "${RAILWAY_TCP_PROXY_DOMAIN:-}" ]; then
      next_host="${RAILWAY_TCP_PROXY_DOMAIN}"
    fi
    if [ -n "${RAILWAY_TCP_PROXY_PORT:-}" ]; then
      next_port="${RAILWAY_TCP_PROXY_PORT}"
    fi
    if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
      next_domain="${RAILWAY_PUBLIC_DOMAIN}"
    fi

    if [ "$current_host" != "$next_host" ] || [ "$current_port" != "$next_port" ] || [ "$current_domain" != "$next_domain" ]; then
      jq --arg h "$next_host" --arg p "$next_port" --arg d "$next_domain" \
        '.proxy_host=$h | .proxy_port=$p | .fake_tls_domain=$d' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "[railway-env] Automatically updated settings from Railway variables."
    fi
  fi
}

# ---------- init defaults on first run ----------
init_defaults() {
  if [ ! -f "$SETTINGS_FILE" ]; then
    jq -n --arg d "${FAKE_TLS_DOMAIN:-www.yahoo.com}" '
      {fake_tls_domain:$d, proxy_host:"", proxy_port:""}
    ' > "$SETTINGS_FILE"
  fi

  apply_railway_env

  if [ ! -f "$USERS_FILE" ]; then
    local domain
    domain=$(jq -r '.fake_tls_domain // "www.yahoo.com"' "$SETTINGS_FILE")
    local secret
    secret=$(generate_secret "$domain")
    jq -n --arg user "dx_admin" --arg secret "$secret" '
      {users: [{user:$user, secret:$secret, enabled:true, created_at:(now|todate)}], version:1}
    ' > "$USERS_FILE"
    echo "[init] created default admin user 'dx_admin'"
  fi

  if [ ! -f "$AUTH_FILE" ]; then
    # default admin/admin - flagged must_change_password so the panel
    # forces a change on first login instead of trusting the operator to remember.
    local hash
    hash=$(node -e "console.log(require('bcryptjs').hashSync('admin', 10))")
    jq -n --arg u "admin" --arg h "$hash" \
      '{username:$u, password_hash:$h, must_change_password:true}' > "$AUTH_FILE"
    echo "[init] created default panel login admin/admin - CHANGE THIS"
  fi
}

# ---------- JSON helpers (machine-readable mode for the panel) ----------
# The panel must never scrape colored/plain-text CLI output. Every piece of
# state it needs has a --json producer here, built from the same files the
# text commands use, so there is exactly one source of truth.
json_users() {
  local proxy_host proxy_port
  proxy_host=$(jq -r '.proxy_host // ""' "$SETTINGS_FILE")
  proxy_port=$(jq -r '.proxy_port // ""' "$SETTINGS_FILE")
  jq --arg h "$proxy_host" --arg p "$proxy_port" '
    {users: [ .users[] | . + {
      link: (if $h=="" or $p=="" then null
             else ("https://t.me/proxy?server="+$h+"&port="+$p+"&secret="+.secret)
             end)
    } ] }
  ' "$USERS_FILE"
}

json_settings() {
  cat "$SETTINGS_FILE"
}

json_status() {
  local mtg_running=false panel_running=false user_count
  pgrep -x mtg-multi >/dev/null 2>&1 && mtg_running=true
  pgrep -af "node /opt/panel/server.js" >/dev/null 2>&1 && panel_running=true
  user_count=$(jq -r '.users | length' "$USERS_FILE")
  jq -n --argjson mtg "$mtg_running" --argjson panel "$panel_running" --argjson n "$user_count" \
    --arg port "${MT_PORT:-8080}" \
    '{mtg_running:$mtg, panel_running:$panel, user_count:$n, mt_port:$port}'
}

json_auth_status() {
  jq '{username, must_change_password: (.must_change_password // false)}' "$AUTH_FILE"
}

# ---------- secret generation (Fake-TLS, ee-prefixed) ----------
generate_secret() {
  local domain="$1"
  local rand hexdomain
  rand=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  hexdomain=$(printf '%s' "$domain" | od -An -tx1 | tr -d ' \n')
  echo "ee${rand}${hexdomain}"
}

# ---------- config regeneration ----------
regen_config() {
  apply_railway_env

  local proxy_host proxy_port
  proxy_host=$(jq -r '.proxy_host // ""' "$SETTINGS_FILE")
  proxy_port=$(jq -r '.proxy_port // ""' "$SETTINGS_FILE")

  {
    echo "bind-to = \"0.0.0.0:${MT_PORT:-8080}\""
    echo "stats-bind-to = \"127.0.0.1:${STATS_PORT:-9090}\""
    echo ""
    echo "[secrets]"
    jq -r '.users[] | select(.enabled==true) | "\(.user) = \"\(.secret)\""' "$USERS_FILE"
  } > "$MTG_CONFIG"

  touch "$RELOAD_FLAG"
}

# ---------- t.me link builder ----------
build_link() {
  local secret="$1"
  local proxy_host proxy_port
  proxy_host=$(jq -r '.proxy_host // ""' "$SETTINGS_FILE")
  proxy_port=$(jq -r '.proxy_port // ""' "$SETTINGS_FILE")
  if [ -z "$proxy_host" ] || [ -z "$proxy_port" ]; then
    echo "(proxy host:port not set — run: dx set-proxy <host:port>)"
  else
    echo "https://t.me/proxy?server=${proxy_host}&port=${proxy_port}&secret=${secret}"
  fi
}

# ---------- host:port normalization & validation ----------
# Called by dx set-proxy (CLI) and indirectly by the panel (via dx).
# Strips protocol prefix, strips path, preserves optional :port,
# rejects empty / whitespace / hostnames with no dot (except localhost).
normalize_host_port() {
  local input="$1"
  # Strip leading http:// or https://
  input="${input#http://}"
  input="${input#https://}"
  # Strip path (everything from first / onward)
  input="${input%%/*}"
  # Trim whitespace
  input="$(echo "$input" | tr -d '[:space:]')"

  [ -z "$input" ] && { echo "Error: proxy address cannot be empty" >&2; return 1; }

  local host port
  if [[ "$input" == *:* ]]; then
    host="${input%%:*}"
    port="${input##*:}"
    if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
      echo "Error: invalid port '$port'" >&2; return 1
    fi
  else
    host="$input"
    port=""
  fi

  if [[ "$host" != "localhost" && "$host" != *.* ]]; then
    echo "Error: invalid hostname '$host' — must be a valid domain (e.g. example.com) or localhost" >&2; return 1
  fi
  if [[ ! "$host" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Error: invalid characters in hostname '$host'" >&2; return 1
  fi

  if [ -n "$port" ]; then
    echo "${host}:${port}"
  else
    echo "$host"
  fi
}
