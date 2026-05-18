#!/bin/bash

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in current directory"
    exit 1
fi

source .env

if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ]; then
    echo "❌ Error: CF_API_TOKEN or CF_ZONE_ID not set in .env"
    exit 1
fi

echo "🔍 Cloudflare Cache Purge Tool"
echo "================================"
echo "💡 Tip: Use * for prefix purge (e.g. https://mozart.build/blog/*)"
echo ""
read -p "Enter URLs to invalidate (comma-separated): " URLS_INPUT

IFS=',' read -ra URLS_ARRAY <<< "$URLS_INPUT"

FILES_JSON="["
PREFIXES_JSON="["

for url in "${URLS_ARRAY[@]}"; do
    url=$(echo "$url" | xargs)

    if [[ "$url" == *\* ]]; then
        # Strip trailing *, then strip https:// or http://
        prefix="${url%\*}"
        prefix="${prefix#https://}"
        prefix="${prefix#http://}"
        PREFIXES_JSON="$PREFIXES_JSON\"$prefix\","
        echo "  🌐 Prefix:  $prefix*"
    else
        FILES_JSON="$FILES_JSON\"$url\","
        echo "  📄 Exact:   $url"
    fi
done

FILES_JSON="${FILES_JSON%,}]"
PREFIXES_JSON="${PREFIXES_JSON%,}]"

echo ""

if [ "$PREFIXES_JSON" != "[]" ] && [ "$FILES_JSON" != "[]" ]; then
    BODY="{\"files\": $FILES_JSON, \"prefixes\": $PREFIXES_JSON}"
elif [ "$PREFIXES_JSON" != "[]" ]; then
    BODY="{\"prefixes\": $PREFIXES_JSON}"
else
    BODY="{\"files\": $FILES_JSON}"
fi

echo "📤 Sending purge request..."

RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ Cache purged successfully!"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ Error purging cache:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi