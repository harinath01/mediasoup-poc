#!/usr/bin/env bash

# Configure secure local access to the k3s server Terraform created. The k3s
# API remains private: SSH forwards local port 6443 to the server's loopback.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/terraform"
KUBECONFIG_PATH="${HOME}/.kube/liveproctoring-k3s.yaml"
PID_FILE="${HOME}/.kube/liveproctoring-k3s-tunnel.pid"
IDENTITY_FILE="${SSH_IDENTITY_FILE:-${HOME}/.ssh/liveproctoring_poc}"
LOCAL_API_PORT="${K3S_LOCAL_API_PORT:-16443}"
ACTION="start"

usage() {
  cat <<'EOF'
Usage: deploy/connect-k3s.sh [start|stop|status] [options]

Options:
  --identity-file <path>  Private SSH key. Default: ~/.ssh/liveproctoring_poc
  --terraform-dir <path>  Terraform directory. Default: ./terraform
  --help                  Show this help.

start (the default) copies the k3s kubeconfig, creates a background SSH tunnel
on localhost:16443, and verifies the cluster. Set K3S_LOCAL_API_PORT to use a
different unused local port. It never exposes port 6443 to the internet.
EOF
}

if [[ $# -gt 0 && ( "$1" == "start" || "$1" == "stop" || "$1" == "status" ) ]]; then
  ACTION="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --identity-file)
      IDENTITY_FILE="${2:-}"
      shift 2
      ;;
    --terraform-dir)
      TERRAFORM_DIR="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

for command in terraform ssh scp kubectl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

mkdir -p "${HOME}/.kube"

if [[ "${ACTION}" == "stop" ]]; then
  if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    kill "$(cat "${PID_FILE}")"
    echo "Stopped liveproctoring k3s SSH tunnel."
  else
    echo "No running liveproctoring k3s SSH tunnel found."
  fi
  rm -f "${PID_FILE}"
  exit 0
fi

if [[ "${ACTION}" == "status" ]]; then
  if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    echo "Tunnel is running (PID $(cat "${PID_FILE}"))."
    KUBECONFIG="${KUBECONFIG_PATH}" kubectl get nodes
  else
    echo "Tunnel is not running."
    exit 1
  fi
  exit 0
fi

PUBLIC_IP="$(terraform -chdir="${TERRAFORM_DIR}" output -raw mediasoup_public_ipv4)"
SSH_OPTIONS=(-o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new)

if [[ -f "${IDENTITY_FILE}" ]]; then
  SSH_OPTIONS+=(-i "${IDENTITY_FILE}")
else
  echo "SSH identity file not found at ${IDENTITY_FILE}; using ssh-agent/default SSH configuration."
fi

echo "Fetching kubeconfig from ${PUBLIC_IP}"
scp "${SSH_OPTIONS[@]}" "root@${PUBLIC_IP}:/etc/rancher/k3s/k3s.yaml" "${KUBECONFIG_PATH}"
chmod 600 "${KUBECONFIG_PATH}"

# The server kubeconfig points at 127.0.0.1:6443. Locally, use a distinct port
# to avoid colliding with Docker Desktop, k3d, or another Kubernetes cluster.
sed -i "s#https://127.0.0.1:6443#https://127.0.0.1:${LOCAL_API_PORT}#" "${KUBECONFIG_PATH}"

if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "Using existing SSH tunnel (PID $(cat "${PID_FILE}"))."
else
  rm -f "${PID_FILE}"
  echo "Starting secure localhost:${LOCAL_API_PORT} SSH tunnel"
  nohup ssh "${SSH_OPTIONS[@]}" -N -L "${LOCAL_API_PORT}:127.0.0.1:6443" "root@${PUBLIC_IP}" \
    >/dev/null 2>&1 &
  TUNNEL_PID="$!"
  sleep 1
  if ! kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    echo "SSH tunnel could not be started. Check SSH access and whether local port ${LOCAL_API_PORT} is already in use." >&2
    exit 1
  fi
  printf '%s\n' "${TUNNEL_PID}" > "${PID_FILE}"
fi

KUBECONFIG="${KUBECONFIG_PATH}" kubectl get nodes

cat <<EOF

Connected. The deploy script will use this kubeconfig automatically.
For interactive kubectl commands in this terminal, run:
  export KUBECONFIG="${KUBECONFIG_PATH}"
EOF
