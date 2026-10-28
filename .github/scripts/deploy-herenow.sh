#!/usr/bin/env bash
# =============================================================================
# Deploy de "Open Defense Fortress" a here.now
# -----------------------------------------------------------------------------
# Replica exacta del deploy manual validado (28-08):
#   1. staging limpio: index.html + privacy.html + css/ + assets/, y js/
#      versionado como js_v<commit> (rompe el cache-control max-age=3600
#      de here.now).
#   2. reescribe `<script src="js/main.js">` -> `js_v<commit>/main.js`
#      y `href="css/style.css"` -> `css/style.css?v=<commit>` en el
#      index.html del staging (el repo queda intacto). El CSS también
#      tiene max-age=3600 y no está versionado: sin el ?v= los clientes
#      que ya lo tenían cacheado siguen viendo el CSS viejo.
#   3. flow de API: PUT /api/v1/publish/<slug> (manifest con hashes)
#      -> uploads a URLs firmadas -> finalize.
#   4. verifica que el index servido por here.now referencia la carpeta nueva.
#
# Uso:
#   HERENOW_API_KEY=<key> bash .github/scripts/deploy-herenow.sh [dir-repo]
# (En GitHub Actions la key viene del secret HERENOW_API_KEY.)
#
# Variables:
#   HERENOW_API_KEY  obligatoria (API key de here.now)
#   HERENOW_SLUG     opcional, default faint-desert-zjv5
# =============================================================================
set -euo pipefail

SLUG="${HERENOW_SLUG:-faint-desert-zjv5}"
API_KEY="${HERENOW_API_KEY:-}"
if [[ -z "$API_KEY" ]]; then
  echo "error: falta HERENOW_API_KEY (secret de GitHub Actions)" >&2
  exit 1
fi

REPO="${1:-.}"
REPO="$(cd "$REPO" && pwd)"
BASE_URL="https://here.now"

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: requiere $cmd" >&2; exit 1; }
done

die() { echo "error: $*" >&2; exit 1; }

guess_content_type() {
  local f="$1"
  case "${f##*.}" in
    html|htm) echo "text/html; charset=utf-8" ;;
    css)      echo "text/css; charset=utf-8" ;;
    js|mjs)   echo "text/javascript; charset=utf-8" ;;
    json)     echo "application/json; charset=utf-8" ;;
    md|txt)   echo "text/plain; charset=utf-8" ;;
    svg)      echo "image/svg+xml" ;;
    png)      echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    gif)      echo "image/gif" ;;
    webp)     echo "image/webp" ;;
    pdf)      echo "application/pdf" ;;
    mp4)      echo "video/mp4" ;;
    mov)      echo "video/quicktime" ;;
    mp3)      echo "audio/mpeg" ;;
    wav)      echo "audio/wav" ;;
    xml)      echo "application/xml" ;;
    woff2)    echo "font/woff2" ;;
    woff)     echo "font/woff" ;;
    ttf)      echo "font/ttf" ;;
    ico)      echo "image/x-icon" ;;
    ogg)      echo "audio/ogg" ;;
    *)        echo "application/octet-stream" ;;
  esac
}

# --- Etiqueta de versión de carpeta: SHA corto del commit (CI) o timestamp ---
JS_TAG="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
JS_DIR="js_v${JS_TAG}"

# --- 1. Staging limpio -------------------------------------------------------
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -r "$REPO/index.html" "$STAGING/"
cp -r "$REPO/privacy.html" "$STAGING/"
cp -r "$REPO/css" "$STAGING/"
cp -r "$REPO/assets" "$STAGING/"
# js/ -> js_v<commit>/ (carpeta nueva por push => URLs nuevas => sin caché vieja)
cp -r "$REPO/js" "$STAGING/$JS_DIR"
# Reescribir la referencia del módulo de entrada en el index del staging
sed -i "s|src=\"js/main.js\"|src=\"$JS_DIR/main.js\"|" "$STAGING/index.html"
# Cache-bust del CSS (mismo motivo que js/: max-age=3600 sin versionar).
sed -i "s|href=\"css/style.css\"|href=\"css/style.css?v=$JS_TAG\"|" "$STAGING/index.html"
echo ">> staging: $STAGING (js -> $JS_DIR, css -> style.css?v=$JS_TAG)"

# --- 2. Manifest + create/update --------------------------------------------
TARGET="$STAGING"
FILES_JSON="[]"
FILE_MAP="{}"
while IFS= read -r -d '' f; do
  rel="${f#$TARGET/}"
  sz=$(wc -c < "$f" | tr -d ' ')
  ct=$(guess_content_type "$f")
  h=$(sha256sum "$f" | cut -d' ' -f1)
  abs="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"
  FILES_JSON=$(echo "$FILES_JSON" | jq --arg p "$rel" --argjson s "$sz" --arg c "$ct" --arg h "$h" \
    '. + [{"path":$p,"size":$s,"contentType":$c,"hash":$h}]')
  FILE_MAP=$(echo "$FILE_MAP" | jq --arg p "$rel" --arg a "$abs" '. + {($p):$a}')
done < <(find "$TARGET" -type f -print0 | sort -z)

file_count=$(echo "$FILES_JSON" | jq 'length')
[[ "$file_count" -gt 0 ]] || die "staging vacío"
echo ">> actualizando $SLUG con $file_count archivos..."

BODY=$(echo "$FILES_JSON" | jq '{files: .}')
RESPONSE=$(curl -sS -X PUT "$BASE_URL/api/v1/publish/$SLUG" \
  -H "authorization: Bearer $API_KEY" \
  -H "x-herenow-client: github-actions/publish-sh" \
  -H "content-type: application/json" \
  -d "$BODY")

if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
  die "$(echo "$RESPONSE" | jq -r '.error')$(echo "$RESPONSE" | jq -r '.details // empty' | sed 's/^/ (/' | sed 's/$/)/')"
fi

VERSION_ID=$(echo "$RESPONSE" | jq -r '.upload.versionId')
FINALIZE_URL=$(echo "$RESPONSE" | jq -r '.upload.finalizeUrl')
SITE_URL=$(echo "$RESPONSE" | jq -r '.siteUrl')
UPLOAD_COUNT=$(echo "$RESPONSE" | jq '.upload.uploads | length')
SKIPPED_COUNT=$(echo "$RESPONSE" | jq '.upload.skipped // [] | length')

# --- 3. Uploads --------------------------------------------------------------
if [[ "$SKIPPED_COUNT" -gt 0 ]]; then
  echo ">> subiendo $UPLOAD_COUNT archivos ($SKIPPED_COUNT sin cambios, omitidos)..."
else
  echo ">> subiendo $UPLOAD_COUNT archivos..."
fi
upload_errors=0
for i in $(seq 0 $((UPLOAD_COUNT - 1))); do
  upload_path=$(echo "$RESPONSE" | jq -r ".upload.uploads[$i].path")
  upload_url=$(echo "$RESPONSE" | jq -r ".upload.uploads[$i].url")
  upload_ct=$(echo "$RESPONSE" | jq -r ".upload.uploads[$i].headers[\"Content-Type\"] // empty")
  local_file=$(echo "$FILE_MAP" | jq -r --arg p "$upload_path" '.[$p]')
  [[ -f "$local_file" ]] || { echo "warning: falta $upload_path" >&2; upload_errors=$((upload_errors + 1)); continue; }
  ct_args=()
  [[ -n "$upload_ct" ]] && ct_args=(-H "Content-Type: $upload_ct")
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" -X PUT "$upload_url" "${ct_args[@]}" --data-binary "@$local_file")
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "warning: upload $upload_path falló (HTTP $http_code)" >&2
    upload_errors=$((upload_errors + 1))
  fi
done
[[ "$upload_errors" -eq 0 ]] || die "$upload_errors archivo(s) no subieron"

# --- 4. Finalize -------------------------------------------------------------
FIN=$(curl -sS -X POST "$FINALIZE_URL" \
  -H "authorization: Bearer $API_KEY" \
  -H "x-herenow-client: github-actions/publish-sh" \
  -H "content-type: application/json" \
  -d "{\"versionId\":\"$VERSION_ID\"}")
if echo "$FIN" | jq -e '.error' >/dev/null 2>&1; then
  die "finalize falló: $(echo "$FIN" | jq -r '.error')"
fi

# --- 5. Verificación post-deploy ---------------------------------------------
echo ">> verificando..."
INDEX=$(curl -sS "https://$SLUG.here.now/")
SERVED_JS=$(echo "$INDEX" | grep -oE '[a-zA-Z0-9_]*js_v[^"]*/main\.js' | head -1)
if [[ "$SERVED_JS" != "$JS_DIR/main.js" ]]; then
  die "el index servido referencia '$SERVED_JS' (esperado '$JS_DIR/main.js')"
fi
JS_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" "https://$SLUG.here.now/$JS_DIR/main.js")
[[ "$JS_HTTP" == "200" ]] || die "main.js servido con HTTP $JS_HTTP"

SERVED_CSS=$(echo "$INDEX" | grep -oE 'css/style\.css\?v=[^"]*' | head -1)
if [[ "$SERVED_CSS" != "css/style.css?v=$JS_TAG" ]]; then
  die "el index servido referencia '$SERVED_CSS' (esperado 'css/style.css?v=$JS_TAG')"
fi
CSS_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" "https://$SLUG.here.now/css/style.css?v=$JS_TAG")
[[ "$CSS_HTTP" == "200" ]] || die "style.css servido con HTTP $CSS_HTTP"

echo ""
echo "publish_result.site_url=$SITE_URL"
echo "publish_result.slug=$SLUG"
echo "publish_result.js_dir=$JS_DIR"
echo "publish_result.css_url=css/style.css?v=$JS_TAG"
echo "publish_result.verified=ok (index -> $JS_DIR/main.js + style.css?v=$JS_TAG, HTTP $JS_HTTP/$CSS_HTTP)"
echo "✅ Publicado: $SITE_URL"