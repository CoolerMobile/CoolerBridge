#!/usr/bin/env sh
# redeploys a coolify resource without build cache
#
# cached builds can keep serving stale code, so every deploy is forced; the
# webhook url is used as copied from coolify, any force flag it carries is
# replaced
#
# @param $1 coolify deploy webhook url
#
# reads COOLIFY_API_TOKEN from the environment
set -eu

hook="${1:?usage: coolify-deploy.sh <deploy webhook url>}"
: "${COOLIFY_API_TOKEN:?COOLIFY_API_TOKEN is not set}"

# drop the copied force flag, then force a build without cache
url=$(printf '%s' "$hook" | sed -E 's/([?&])force=[^&]*(&|$)/\1/; s/[?&]$//')
case "$url" in
  *\?*) url="$url&force=true" ;;
  *) url="$url?force=true" ;;
esac

curl --fail --silent --show-error \
  --request POST "$url" \
  --header "Authorization: Bearer $COOLIFY_API_TOKEN"
