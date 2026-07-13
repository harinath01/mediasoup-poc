#!/usr/bin/env bash

# Install cert-manager once per cluster, configure the Let's Encrypt account,
# then request a TLS certificate through the existing Traefik Ingress.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERT_MANAGER_VERSION="v1.21.0"

if [[ -z "${KUBECONFIG:-}" && -f "${HOME}/.kube/liveproctoring-k3s.yaml" ]]; then
  export KUBECONFIG="${HOME}/.kube/liveproctoring-k3s.yaml"
fi

for command in kubectl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

kubectl -n cert-manager rollout status deployment/cert-manager --timeout=5m
kubectl -n cert-manager rollout status deployment/cert-manager-cainjector --timeout=5m
kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=5m

kubectl apply -k "${REPO_ROOT}/k8s/cert-manager"

# This applies the TLS-enabled Ingress, preserves the Terraform-derived
# announced IP, and restarts the app only if necessary.
"${SCRIPT_DIR}/apply-k3s.sh" --skip-image-sync

echo "Waiting for Let's Encrypt to issue liveproctoring.tpsentinel.com"
kubectl -n liveproctoring wait \
  --for=condition=Ready certificate/liveproctoring-tls \
  --timeout=5m

kubectl -n liveproctoring get certificate liveproctoring-tls
