#!/usr/bin/env bash
#
# Author: Alex Olsson
# Copyright (C) 2026 Node42 (www.node42.dev)
# Email: a1exnd3r@node42.dev
# GitHub: https://github.com/node42-dev
#
set -euo pipefail

clear

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_CERT_ID="051729ab-9e56-492f-87a2-2c9edaa73e35"
DEFAULT_SENDER_ID="iso6523-actorid-upis::0007:node42"
DEFAULT_RECEIVER_ID="iso6523-actorid-upis::9915:helger"
DEFAULT_SENDER_COUNTRY="SE"
DEFAULT_HOSTNAME="node42"

ENDPOINT_OPTIONS=(
  "https://ap.node42.dev/as4/123"
  "https://api.node42.dev/as4"
  "https://ap-peppol.n42.workers.dev/as4"
  "https://ap-peppol.azurewebsites.net/api/as4"
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
echo "  Node42 — eDelivery Send Test"
echo "  ─────────────────────────────────────────"
echo "  d = default  |  enter = skip  |  type (or paste) to override"
echo ""

CERT_ID=$(prompt        "Cert ID          [d: $DEFAULT_CERT_ID]"        "$DEFAULT_CERT_ID")
SENDER_ID=$(prompt      "Sender ID        [d: $DEFAULT_SENDER_ID]"      "$DEFAULT_SENDER_ID")
RECEIVER_ID=$(prompt    "Receiver ID      [d: $DEFAULT_RECEIVER_ID]"    "$DEFAULT_RECEIVER_ID")
SENDER_COUNTRY=$(prompt "Sender country   [d: $DEFAULT_SENDER_COUNTRY]" "$DEFAULT_SENDER_COUNTRY")
HOSTNAME=$(prompt       "Hostname         [d: $DEFAULT_HOSTNAME]"       "$DEFAULT_HOSTNAME")
DOCUMENT=$(prompt       "Document path    [d: none]"                    "")
SCHEMATRON=$(prompt     "Schematron path  [d: none]"                    "")

echo ""
echo "  Select endpoint:"
for i in "${!ENDPOINT_OPTIONS[@]}"; do
  printf "  %d) %s\n" "$((i+1))" "${ENDPOINT_OPTIONS[$i]}"
done
echo ""

read -p "  Choose endpoint [1-${#ENDPOINT_OPTIONS[@]}] (enter=last): " EP_INDEX

if [[ -z "$EP_INDEX" ]]; then
  ENDPOINT_URL="${ENDPOINT_OPTIONS[-1]}"
else
  ENDPOINT_URL="${ENDPOINT_OPTIONS[$((EP_INDEX-1))]}"
fi

echo ""
read -p "  Enable dryrun?  (y/n): " DRYRUN_INPUT
read -p "  Enable persist? (y/n): " PERSIST_INPUT
read -p "  Enable verbose? (y/n): " VERBOSE_INPUT
echo ""

# ── Build args ────────────────────────────────────────────────────────────────

ARGS=()

[[ -n "$CERT_ID"        ]] && ARGS+=(--cert-id        "$CERT_ID")
[[ -n "$SENDER_ID"      ]] && ARGS+=(--sender-id      "$SENDER_ID")
[[ -n "$RECEIVER_ID"    ]] && ARGS+=(--receiver-id    "$RECEIVER_ID")
[[ -n "$SENDER_COUNTRY" ]] && ARGS+=(--sender-country "$SENDER_COUNTRY")
[[ -n "$ENDPOINT_URL"   ]] && ARGS+=(--endpoint-url   "$ENDPOINT_URL")
[[ -n "$HOSTNAME"       ]] && ARGS+=(--hostname       "$HOSTNAME")
[[ -n "$DOCUMENT"       ]] && ARGS+=(--document       "$DOCUMENT")
[[ -n "$SCHEMATRON"     ]] && ARGS+=(--schematron     "$SCHEMATRON")

[[ "$DRYRUN_INPUT"  =~ ^[Yy]$ ]] && ARGS+=(--dryrun)
[[ "$PERSIST_INPUT" =~ ^[Yy]$ ]] && ARGS+=(--persist)
[[ "$VERBOSE_INPUT" =~ ^[Yy]$ ]] && ARGS+=(--verbose)

# ── Send ──────────────────────────────────────────────────────────────────────

n42-edelivery send peppol --env "test" "${ARGS[@]}"