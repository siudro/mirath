#!/usr/bin/env bash
# verify-key.sh — فحص المفتاح والموديل قبل النشر.
#
#   OPENAI_API_KEY=sk-... bash verify-key.sh
#
# لا يخزّن المفتاح ولا يطبعه. يستخدمه للاستعلام فقط.
set -u

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ضع المفتاح أولًا:"
  echo "  OPENAI_API_KEY=sk-... bash verify-key.sh"
  exit 1
fi

AUTH="Authorization: Bearer $OPENAI_API_KEY"

echo "=== 1. Is the key valid? ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "$AUTH" https://api.openai.com/v1/models)

case "$CODE" in
  200) echo "  key: VALID (HTTP 200)";;
  401) echo "  key: REJECTED (HTTP 401) — wrong or revoked"; exit 1;;
  429) echo "  key: valid but rate-limited (HTTP 429)";;
  *)   echo "  key: unexpected HTTP $CODE"; exit 1;;
esac

echo
echo "=== 2. Which models does this account actually have? ==="
curl -s -H "$AUTH" https://api.openai.com/v1/models | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("  could not parse response"); raise SystemExit(0)
ids = sorted(m.get("id","") for m in d.get("data", []))
print(f"  total models: {len(ids)}")
interesting = [i for i in ids if any(k in i.lower() for k in ("luna","gpt-6","gpt6","gpt-5","gpt-4","vision"))]
if interesting:
    print("  matching luna / gpt-6 / vision:")
    for i in interesting:
        print("   ", i)
else:
    print("  none matched luna/gpt-6/vision")
    print("  all models:", ", ".join(ids[:30]))
'

echo
echo "=== 3. Does luna-gpt6 exist for this account? ==="
MODEL="${MIRATH_WRITER_MODEL:-luna-gpt6}"
R=$(curl -s -X POST https://api.openai.com/v1/chat/completions \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply with the single word: ok\"}],\"max_tokens\":10}")

echo "$R" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    j = json.loads(raw)
except Exception:
    print("  unparseable:", raw[:200]); raise SystemExit(0)
if "error" in j:
    e = j["error"]
    print(f"  FAILED: {e.get(\"code\") or e.get(\"type\")} — {e.get(\"message\",\"\")[:160]}")
    print()
    print("  => set MIRATH_WRITER_MODEL / MIRATH_VERIFIER_MODEL")
    print("     to one of the ids listed in step 2.")
else:
    c = (j.get("choices") or [{}])[0].get("message", {}).get("content", "")
    print(f"  OK: model \"{j.get(\"model\")}\" replied: {c.strip()[:40]!r}")
'

echo
echo "=== 4. Does it accept an image (vision)? ==="
# صورة PNG صغيرة صالحة 1×1
IMG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
curl -s -X POST https://api.openai.com/v1/chat/completions \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"max_tokens\":20,\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"what color is this image? one word\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"data:image/png;base64,$IMG\"}}]}]}" \
| python3 -c '
import json, sys
try:
    j = json.load(sys.stdin)
except Exception:
    print("  unparseable"); raise SystemExit(0)
if "error" in j:
    e = j["error"]
    print(f"  VISION FAILED: {e.get(\"code\") or e.get(\"message\",\"\")[:120]}")
else:
    print("  VISION OK — image accepted")
'

echo
echo "Done. If steps 3 and 4 passed, the app will work with these values."
