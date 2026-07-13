#!/usr/bin/env bash

# Install the k6 Operator and its TestRun CRD once per k3s cluster.
set -euo pipefail

K6_OPERATOR_VERSION="v0.0.22"

if [[ -z "${KUBECONFIG:-}" && -f "${HOME}/.kube/liveproctoring-k3s.yaml" ]]; then
  export KUBECONFIG="${HOME}/.kube/liveproctoring-k3s.yaml"
fi

command -v kubectl >/dev/null 2>&1 || {
  echo "Missing required command: kubectl" >&2
  exit 1
}

kubectl apply -f "https://raw.githubusercontent.com/grafana/k6-operator/${K6_OPERATOR_VERSION}/bundle.yaml"
kubectl -n k6-operator-system rollout status deployment/k6-operator-controller-manager --timeout=5m
kubectl get crd testruns.k6.io >/dev/null

echo "k6 Operator ${K6_OPERATOR_VERSION} is ready."
