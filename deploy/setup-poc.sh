#!/usr/bin/env bash

# Interactive first-time setup for the single-server mediasoup Kubernetes POC.
# Individual scripts remain available for updates and troubleshooting.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/terraform"
DOMAIN="liveproctoring.tpsentinel.com"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local value
  read -r -p "${prompt} [${default}]: " value
  printf '%s' "${value:-${default}}"
}

for command in terraform ssh scp kubectl docker helm ssh-keygen getent; do
  require_command "${command}"
done

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  read -r -s "HCLOUD_TOKEN?Hetzner Cloud API token: "
  echo
  export HCLOUD_TOKEN
fi

SERVER_TYPE="$(prompt_with_default 'Hetzner server type' 'cpx41')"
LOCATION="$(prompt_with_default 'Hetzner location' 'fsn1')"
SSH_PUBLIC_KEY="$(prompt_with_default 'SSH public-key path' "${HOME}/.ssh/liveproctoring_poc.pub")"
if [[ "${SSH_PUBLIC_KEY}" == "~/"* ]]; then
  SSH_PUBLIC_KEY="${HOME}/${SSH_PUBLIC_KEY#~/}"
fi
SSH_PRIVATE_KEY="${SSH_PUBLIC_KEY%.pub}"

if [[ ! -f "${SSH_PUBLIC_KEY}" ]]; then
  read -r -p "SSH key does not exist. Create ${SSH_PRIVATE_KEY} now? [Y/n] " CREATE_KEY
  if [[ "${CREATE_KEY:-Y}" =~ ^[Yy]$ ]]; then
    ssh-keygen -t ed25519 -C 'liveproctoring-poc' -f "${SSH_PRIVATE_KEY}"
  else
    echo "An SSH public key is required to create the server." >&2
    exit 1
  fi
fi

read -r -s -p 'Grafana admin password: ' GRAFANA_ADMIN_PASSWORD
echo
if [[ -z "${GRAFANA_ADMIN_PASSWORD}" ]]; then
  echo "Grafana admin password cannot be empty." >&2
  exit 1
fi

echo
echo "Creating or updating the Hetzner server (${SERVER_TYPE} in ${LOCATION})"
terraform -chdir="${TERRAFORM_DIR}" init
terraform -chdir="${TERRAFORM_DIR}" apply \
  -var="server_type=${SERVER_TYPE}" \
  -var="location=${LOCATION}" \
  -var="ssh_public_key_path=${SSH_PUBLIC_KEY}"

echo "Connecting to k3s and waiting until its node is ready"
for attempt in {1..30}; do
  if "${SCRIPT_DIR}/connect-k3s.sh" --identity-file "${SSH_PRIVATE_KEY}"; then
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "k3s was not ready after 30 attempts. Check the server with SSH and rerun this script." >&2
    exit 1
  fi
  echo "k3s is still installing; retrying in 10 seconds (${attempt}/30)."
  sleep 10
done

echo "Building and deploying the mediasoup application"
"${SCRIPT_DIR}/apply-k3s.sh" --identity-file "${SSH_PRIVATE_KEY}"

echo "Installing Prometheus and Grafana"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD}" "${SCRIPT_DIR}/setup-monitoring.sh"

SERVER_IP="$(terraform -chdir="${TERRAFORM_DIR}" output -raw mediasoup_public_ipv4)"
cat <<EOF

GoDaddy action required:
Create or update the A record below, then wait for it to propagate.

  ${DOMAIN}  ->  ${SERVER_IP}

Press Enter only after you have updated the record.
EOF
read -r

until getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | sort -u | grep -qx "${SERVER_IP}"; do
  echo "${DOMAIN} does not resolve to ${SERVER_IP} yet. Wait a little, then press Enter to check again."
  read -r
done

echo "DNS is correct. Requesting the Let's Encrypt certificate."
"${SCRIPT_DIR}/setup-tls.sh"

cat <<EOF

Setup complete.

Application: https://${DOMAIN}
Grafana:     http://${SERVER_IP}:30300
Grafana user: admin
EOF
