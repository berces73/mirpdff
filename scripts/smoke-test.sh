#!/usr/bin/env bash
# ============================================================
# scripts/smoke-test.sh — MirPDF Deploy Sonrası Smoke Test
#
# Kullanım:
#   bash scripts/smoke-test.sh
#   PROD_URL=https://mirpdf.com bash scripts/smoke-test.sh
#
# Çıkış kodu:
#   0  — tüm smoke testler geçti
#   1  — bir veya daha fazla kritik test başarısız
# ============================================================
set -u

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0
declare -a RESULTS=()

pass() { PASS=$((PASS+1));  RESULTS+=("${GREEN}✅${NC}  $1"); }
fail() { FAIL=$((FAIL+1));  RESULTS+=("${RED}❌${NC}  $1"); }
warn() { WARN=$((WARN+1));  RESULTS+=("${YELLOW}⚠️ ${NC}  $1"); }
hdr()  { printf "\n${CYAN}${BOLD}── %s ──${NC}\n" "$1"; }

BASE="${PROD_URL:-https://mirpdf.com}"
printf "${BOLD}MirPDF Smoke Test${NC} → %s\n" "$BASE"
printf "Zaman: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"

curl_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$@" 2>/dev/null || echo "000"
}
curl_body() {
  curl -s --max-time 15 "$@" 2>/dev/null || echo ""
}

# ─── 1. Temel sayfalar ────────────────────────────────────────────────────────
hdr "1 / 5  Temel Sayfalar"

declare -A PAGES=(
  ["/"]=200
  ["/pdf-sikistir"]=200
  ["/pdf-birlestir"]=200
  ["/pdf-to-word"]=200
  ["/pdf-sayfa-numarala"]=200
  ["/pricing"]=200
  ["/faq"]=200
  ["/sitemap.xml"]=200
  ["/robots.txt"]=200
  ["/404"]=404
)

for path in "${!PAGES[@]}"; do
  expected="${PAGES[$path]}"
  got=$(curl_status "$BASE$path")
  if [[ "$got" == "$expected" ]]; then
    pass "GET $path → $got"
  elif [[ "$expected" == "404" && "$got" == "404" ]]; then
    pass "GET $path → $got (404 bekleniyor ✓)"
  else
    fail "GET $path → $got (beklenen $expected)"
  fi
done

# ─── 2. Worker API ────────────────────────────────────────────────────────────
hdr "2 / 5  Worker API"

# /health endpoint
health_body=$(curl_body "$BASE/health")
if echo "$health_body" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok')==True else 1)" 2>/dev/null; then
  pass "GET /health → {status:ok}"
else
  s=$(curl_status "$BASE/health")
  [[ "$s" == "200" ]] && warn "GET /health → 200 ama JSON format beklenmedik" || fail "GET /health → $s"
fi

# Kimlik doğrulama gereken endpoint — yetkisiz 401 dönmeli
s=$(curl_status "$BASE/api/credits/history")
case "$s" in
  401|403) pass "GET /api/credits/history kimliksiz → $s ✓";;
  *)       fail "GET /api/credits/history kimliksiz → $s (beklenen 401/403)";;
esac

# Rate limit endpoint'i tanımlı mı (404 değil)
s=$(curl_status -X POST -H "Content-Type: application/json" -d '{"tool":"compress"}' "$BASE/api/jobs/submit")
[[ "$s" != "404" ]] && pass "POST /api/jobs/submit endpoint mevcut ($s)" || fail "POST /api/jobs/submit → 404 (endpoint kayıp)"

# ─── 3. Güvenlik ──────────────────────────────────────────────────────────────
hdr "3 / 5  Güvenlik"

# Admin açık değil
s=$(curl_status "$BASE/admin/")
case "$s" in
  401|403|302) pass "GET /admin/ → $s (erişim yok ✓)";;
  200)         fail "GET /admin/ → 200 ❌ KRİTİK: Admin herkese açık!";;
  *)           warn "GET /admin/ → $s";;
esac

# Evil origin CORS
acao=$(curl -s -o /dev/null -w "%{header_json}" --max-time 10 \
  -H "Origin: https://evil-attacker.example.com" \
  "$BASE/api/compress" 2>/dev/null | \
  python3 -c "
import sys,json
try:
  h=json.load(sys.stdin)
  v=h.get('access-control-allow-origin',[''])[0]
  print(v)
except:
  print('')
" 2>/dev/null || echo "")
if [[ "$acao" == "*" ]]; then
  fail "CORS: evil origin wildcard ACAO alıyor ❌"
elif [[ -z "$acao" || "$acao" == "null" ]]; then
  pass "CORS: evil origin ACAO yok ✓"
else
  warn "CORS: evil origin ACAO='$acao' (incele)"
fi

# HSTS header
hsts=$(curl -sI --max-time 10 "$BASE" 2>/dev/null | grep -i "strict-transport-security" | head -1 || echo "")
[[ -n "$hsts" ]] && pass "HSTS header aktif" || warn "HSTS header bulunamadı (Cloudflare'de etkinleştir)"

# X-Frame-Options veya CSP frame-ancestors
xfo=$(curl -sI --max-time 10 "$BASE" 2>/dev/null | grep -iE "x-frame-options|content-security-policy" | head -1 || echo "")
[[ -n "$xfo" ]] && pass "Clickjacking koruması mevcut" || warn "X-Frame-Options / CSP frame-ancestors yok"

# ─── 4. SEO / Content ─────────────────────────────────────────────────────────
hdr "4 / 5  SEO & İçerik"

# robots.txt mirpdf.com içeriyor mu
robots=$(curl_body "$BASE/robots.txt")
echo "$robots" | grep -qi "mirpdf" && pass "robots.txt mirpdf.com referansı var" || warn "robots.txt mirpdf.com referansı yok"
echo "$robots" | grep -qi "Disallow: /admin" && pass "robots.txt /admin disallow" || warn "robots.txt /admin disallow eksik"

# sitemap.xml parse edilebiliyor mu
sitemap=$(curl_body "$BASE/sitemap.xml")
echo "$sitemap" | grep -q "<urlset" && pass "sitemap.xml geçerli XML başlangıcı" || fail "sitemap.xml geçersiz veya boş"
echo "$sitemap" | grep -q "mirpdf.com" && pass "sitemap.xml mirpdf.com URL'leri var" || fail "sitemap.xml mirpdf.com URL'leri yok (FILL_ACTUAL_DOMAIN kalmış olabilir)"

# Canonical kontrolü (anasayfa)
home=$(curl_body "$BASE/")
echo "$home" | grep -q 'rel="canonical"' && pass "Anasayfa canonical tag mevcut" || warn "Anasayfa canonical tag yok"
echo "$home" | grep -qi "FILL_ACTUAL_DOMAIN\|yourdomain\.com\|PDF3" && fail "Anasayfa: placeholder kaldı!" || pass "Anasayfa: placeholder temiz"

# ─── 5. e-Fatura cluster spot check ──────────────────────────────────────────
hdr "5 / 5  e-Fatura Cluster"

CLUSTER_PAGES=(
  "/e-fatura/"
  "/e-fatura/e-fatura-pdf-kucultme/"
  "/e-fatura/gib-portal-pdf-yukleme-hatasi/"
)
for p in "${CLUSTER_PAGES[@]}"; do
  s=$(curl_status "$BASE$p")
  [[ "$s" == "200" ]] && pass "GET $p → 200" || fail "GET $p → $s (beklenen 200)"
done

# ─── Özet ─────────────────────────────────────────────────────────────────────
printf "\n${BOLD}══════════════════════════════════════${NC}\n"
printf "${BOLD}  SMOKE TEST SONUÇLARI${NC}\n"
printf "${BOLD}══════════════════════════════════════${NC}\n\n"

for r in "${RESULTS[@]}"; do
  printf "  %b\n" "$r"
done

printf "\n  ${GREEN}✅ PASS: %d${NC}   ${RED}❌ FAIL: %d${NC}   ${YELLOW}⚠️  WARN: %d${NC}\n\n" \
  "$PASS" "$FAIL" "$WARN"

if [[ "$FAIL" -gt 0 ]]; then
  printf "  ${RED}${BOLD}🚨 %d kritik sorun — acil kontrol gerekli.${NC}\n\n" "$FAIL"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  printf "  ${YELLOW}${BOLD}⚠️  %d uyarı — gözden geçir.${NC}\n\n" "$WARN"
  exit 0
else
  printf "  ${GREEN}${BOLD}✅ Tüm smoke testler geçti.${NC}\n\n"
  exit 0
fi
