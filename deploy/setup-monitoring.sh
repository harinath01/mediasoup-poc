#!/usr/bin/env bash

# Install the Prometheus/Grafana stack and expose Grafana for this POC at the
# Terraform-created server IP on TCP port 30300.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${KUBECONFIG:-}" && -f "${HOME}/.kube/liveproctoring-k3s.yaml" ]]; then
  export KUBECONFIG="${HOME}/.kube/liveproctoring-k3s.yaml"
fi

for command in helm kubectl terraform; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

SERVER_IP="$(terraform -chdir="${REPO_ROOT}/terraform" output -raw mediasoup_public_ipv4)"
HELM_ARGS=()

if [[ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
  HELM_ARGS+=(--set-string "grafana.adminPassword=${GRAFANA_ADMIN_PASSWORD}")
fi

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo update prometheus-community
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values "${REPO_ROOT}/k8s/monitoring/values.yaml" \
  "${HELM_ARGS[@]}"

kubectl apply -f "${REPO_ROOT}/k8s/monitoring/mediasoup-dashboard.yaml"
kubectl apply -f "${REPO_ROOT}/k8s/monitoring/grafana-nodeport.yaml"
kubectl -n monitoring rollout status deployment/kube-prometheus-stack-grafana --timeout=10m

cat <<EOF

Grafana is being started. Once its Pod is Ready, open:
  http://${SERVER_IP}:30300

Login user: admin
Password: the password chosen for this setup (or grafana.adminPassword in
          k8s/monitoring/values.yaml when no password was supplied).

This POC NodePort uses plain HTTP. Do not expose it broadly or keep the default
password in a production environment; use a Grafana DNS name and HTTPS instead.
EOF
