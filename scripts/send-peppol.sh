#!/usr/bin/env bash
#
# Author: Alex Olsson
# Copyright (C) 2026 Node42 (www.node42.dev)
# Email: a1exnd3r@node42.dev
# GitHub: https://github.com/node42-dev
#

set -euo pipefail
clear

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────

SECRETS_PATH=""

DEFAULT_CERT_ID="051729ab-9e56-492f-87a2-2c9edaa73e35"
DEFAULT_SENDER_ID="0007:node42"
DEFAULT_SENDER_COUNTRY="SE"
DEFAULT_HOSTNAME="node42"
DEFAULT_DOCUMENT="$HOME/Documents/qvalia/as4-invoice.xml"

RECEIVER_OPTIONS=(
  "9915:helger"
)

ENDPOINT_OPTIONS=(
  "https://api.node42.dev/as4"                        # AWS
  "https://ap-peppol.n42.workers.dev/as4"             # Cloudflare
  "https://ap-peppol.azurewebsites.net/api/as4"       # Azure
)

# ── Helper ────────────────────────────────────────────────────────────────────

# d = use default, enter = skip, anything else = use as value
prompt() {
  local label="$1"
  local default="$2"
  local input
  read -p "  $label: " input
  if [[ "$input" == "d" ]]; then
    echo "$default"
  else
    echo "$input"
  fi
}

# ── UI ────────────────────────────────────────────────────────────────────────

echo ""
echo "  Node42 — eDelivery CLI Utility"
echo "  ─────────────────────────────────────────"
echo "  d = default  |  enter = skip  |  type (or paste) to override"
echo ""

CERT_ID=$(prompt        "Cert ID          [d: $DEFAULT_CERT_ID]"        "$DEFAULT_CERT_ID")
SENDER_ID=$(prompt      "Sender ID        [d: $DEFAULT_SENDER_ID]"      "$DEFAULT_SENDER_ID")
SENDER_COUNTRY=$(prompt "Sender country   [d: $DEFAULT_SENDER_COUNTRY]" "$DEFAULT_SENDER_COUNTRY")
HOSTNAME=$(prompt       "Hostname         [d: $DEFAULT_HOSTNAME]"       "$DEFAULT_HOSTNAME")
DOCUMENT=$(prompt       "Document path    [d: $DEFAULT_DOCUMENT]"       "$DEFAULT_DOCUMENT")
SCHEMATRON=$(prompt     "Schematron path  [d: none]"                    "")


echo ""
echo "  Select receiver:"
for i in "${!RECEIVER_OPTIONS[@]}"; do
  printf "  %d) %s\n" "$((i+1))" "${RECEIVER_OPTIONS[$i]}"
done
echo ""

read -p "  Choose receiver [1-${#RECEIVER_OPTIONS[@]}] (enter=last): " EP1_INDEX

if [[ -z "$EP1_INDEX" ]]; then
  RECEIVER_ID="${RECEIVER_OPTIONS[-1]}"
else
  RECEIVER_ID="${RECEIVER_OPTIONS[$((EP1_INDEX-1))]}"
fi


echo ""
echo "  Override endpoint:"
for i in "${!ENDPOINT_OPTIONS[@]}"; do
  printf "  %d) %s\n" "$((i+1))" "${ENDPOINT_OPTIONS[$i]}"
done
echo ""

read -p "  Choose endpoint [1-${#ENDPOINT_OPTIONS[@]}] (enter=none): " EP2_INDEX

if [[ -z "$EP2_INDEX" ]]; then
  ENDPOINT_URL=""
else
  ENDPOINT_URL="${ENDPOINT_OPTIONS[$((EP2_INDEX-1))]}"
fi

echo ""
[[ -n "$SECRETS_PATH" ]] && read -p "  Load secrets?   (y/n): " LOAD_SECRETS
read -p "  Enable dryrun?  (y/n): " DRYRUN_INPUT
read -p "  Enable persist? (y/n): " PERSIST_INPUT
read -p "  Enable verbose? (y/n): " VERBOSE_INPUT
echo ""

# ── Build args ────────────────────────────────────────────────────────────────

ARGS=()

[[ -n "$CERT_ID"        ]] && ARGS+=(--cert-id        "$CERT_ID")
[[ -n "$SENDER_ID"      ]] && ARGS+=(--sender-id      "iso6523-actorid-upis::$SENDER_ID")
[[ -n "$RECEIVER_ID"    ]] && ARGS+=(--receiver-id    "iso6523-actorid-upis::$RECEIVER_ID")
[[ -n "$SENDER_COUNTRY" ]] && ARGS+=(--sender-country "$SENDER_COUNTRY")
[[ -n "$ENDPOINT_URL"   ]] && ARGS+=(--endpoint-url   "$ENDPOINT_URL")
[[ -n "$HOSTNAME"       ]] && ARGS+=(--hostname       "$HOSTNAME")
[[ -n "$DOCUMENT"       ]] && ARGS+=(--document       "$DOCUMENT")
[[ -n "$SCHEMATRON"     ]] && ARGS+=(--schematron     "$SCHEMATRON")

[[ "$DRYRUN_INPUT"  =~ ^[Yy]$ ]] && ARGS+=(--dryrun)
[[ "$PERSIST_INPUT" =~ ^[Yy]$ ]] && ARGS+=(--persist)
[[ "$VERBOSE_INPUT" =~ ^[Yy]$ ]] && ARGS+=(--verbose)
[[ "$LOAD_SECRETS"  =~ ^[Yy]$ ]] && source "$SECRETS_PATH"

# ── Send ──────────────────────────────────────────────────────────────────────

n42-edelivery send peppol --env "test" "${ARGS[@]}"