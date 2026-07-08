#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLAYBOOK_PATH="${REPO_ROOT}/deploy/ansible/playbook.yml"

usage() {
  cat <<'EOF'
Usage:
  deploy/bootstrap-hetzner.sh --host <ip> --root-password <password> --user-password <password> [options]

Options:
  --root-user <user>            Initial SSH user. Default: root
  --root-password <password>    Password for the initial SSH user
  --user <user>                 Application SSH user to create/use. Default: ubuntu
  --user-password <password>    Password for the application SSH user
  --domain <domain>             Public domain. Default: liveproctoring.tpsentinel.com
  --letsencrypt-email <email>   Email for Let's Encrypt registration. Default: none
  --public-ip <ip>              mediasoup announced IP. Default: same as --host
  --app-dir <path>              Remote project path. Default: /home/<user>/mediasoup-poc
  --port <port>                 Backend port. Default: 3001
  --node-version <major>        Node.js major version. Default: 22
  --pnpm-version <version>      pnpm version. Default: 10.13.1

Example:
  deploy/bootstrap-hetzner.sh \
    --host 1.2.3.4 \
    --root-password 'root-secret' \
    --user ubuntu \
    --user-password 'ubuntu-secret'
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_supported_ansible() {
  local version major minor
  version="$(ansible --version | awk 'NR==1 {print $2}')"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"

  if [[ -z "${major}" || -z "${minor}" ]]; then
    echo "Could not determine Ansible version from: ${version}" >&2
    exit 1
  fi

  if (( major < 2 || (major == 2 && minor < 16) )); then
    cat >&2 <<EOF
Unsupported Ansible version: ${version}
Use Ansible 2.16 or newer. Ubuntu's distro ansible package is often too old for this workflow.
Recommended install:
  python3 -m pip install --user pipx
  python3 -m pipx ensurepath
  pipx install 'ansible-core>=2.16,<2.19'
EOF
    exit 1
  fi
}

HOST=""
ROOT_USER="root"
ROOT_PASSWORD=""
USER_NAME="ubuntu"
USER_PASSWORD=""
DOMAIN="liveproctoring.tpsentinel.com"
LETSENCRYPT_EMAIL=""
PUBLIC_IP=""
APP_DIR=""
PORT="3001"
NODE_VERSION="22"
PNPM_VERSION="10.13.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --user)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --root-user)
      ROOT_USER="${2:-}"
      shift 2
      ;;
    --root-password)
      ROOT_PASSWORD="${2:-}"
      shift 2
      ;;
    --password)
      ROOT_PASSWORD="${2:-}"
      shift 2
      ;;
    --user-password)
      USER_PASSWORD="${2:-}"
      shift 2
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --letsencrypt-email)
      LETSENCRYPT_EMAIL="${2:-}"
      shift 2
      ;;
    --public-ip)
      PUBLIC_IP="${2:-}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --node-version)
      NODE_VERSION="${2:-}"
      shift 2
      ;;
    --pnpm-version)
      PNPM_VERSION="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${HOST}" || -z "${ROOT_PASSWORD}" || -z "${USER_PASSWORD}" ]]; then
  usage
  exit 1
fi

if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="${HOST}"
fi

if [[ -z "${APP_DIR}" ]]; then
  APP_DIR="/home/${USER_NAME}/mediasoup-poc"
fi

require_cmd ansible-playbook
require_cmd sshpass
require_cmd rsync
require_cmd ssh
require_supported_ansible

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

INVENTORY_PATH="${TMP_DIR}/inventory.ini"

cat > "${INVENTORY_PATH}" <<EOF
[hetzner]
target ansible_host=${HOST} ansible_user=${USER_NAME}
EOF

echo "Bootstrapping ${USER_NAME} via ${ROOT_USER}@${HOST}"
sshpass -p "${ROOT_PASSWORD}" ssh -o StrictHostKeyChecking=no "${ROOT_USER}@${HOST}" \
  "export APP_USER='${USER_NAME}' APP_PASSWORD='${USER_PASSWORD}' APP_DIR='${APP_DIR}'; bash -s" <<'EOF'
set -euo pipefail

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${APP_USER}"
fi

echo "${APP_USER}:${APP_PASSWORD}" | chpasswd
usermod -aG sudo "${APP_USER}"

install -d -m 0755 "/etc/sudoers.d"
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${APP_USER}" > "/etc/sudoers.d/${APP_USER}"
chmod 0440 "/etc/sudoers.d/${APP_USER}"

if ! command -v rsync >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
fi

mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
EOF

echo "Preparing remote directory ${APP_DIR}"
sshpass -p "${USER_PASSWORD}" ssh -o StrictHostKeyChecking=no "${USER_NAME}@${HOST}" "mkdir -p '${APP_DIR}'"

echo "Syncing repository to ${USER_NAME}@${HOST}:${APP_DIR}"
sshpass -p "${USER_PASSWORD}" rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'logs/' \
  --exclude '.DS_Store' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "${REPO_ROOT}/" "${USER_NAME}@${HOST}:${APP_DIR}/"

echo "Running Ansible provisioning"
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook \
  -i "${INVENTORY_PATH}" \
  "${PLAYBOOK_PATH}" \
  --extra-vars "ansible_password=${USER_PASSWORD}" \
  --extra-vars "app_user=${USER_NAME}" \
  --extra-vars "app_dir=${APP_DIR}" \
  --extra-vars "app_domain=${DOMAIN}" \
  --extra-vars "letsencrypt_email=${LETSENCRYPT_EMAIL}" \
  --extra-vars "mediasoup_announced_ip=${PUBLIC_IP}" \
  --extra-vars "server_port=${PORT}" \
  --extra-vars "node_major_version=${NODE_VERSION}" \
  --extra-vars "pnpm_version=${PNPM_VERSION}"

echo "Deployment finished"
