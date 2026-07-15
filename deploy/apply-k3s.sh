#!/usr/bin/env bash

# Deploy the application with the public address created by Terraform. This
# keeps the WebRTC announced address out of committed Kubernetes manifests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/terraform"
KUSTOMIZE_DIR="${REPO_ROOT}/k8s/base"
IMAGE=""
SKIP_IMAGE_SYNC="false"
IDENTITY_FILE="${SSH_IDENTITY_FILE:-${HOME}/.ssh/liveproctoring_poc}"

if [[ -z "${KUBECONFIG:-}" && -f "${HOME}/.kube/liveproctoring-k3s.yaml" ]]; then
  export KUBECONFIG="${HOME}/.kube/liveproctoring-k3s.yaml"
fi

usage() {
  cat <<'EOF'
Usage: deploy/apply-k3s.sh [options]

Options:
  --image <registry/image:tag>  Deploy an image already available from a registry.
  --skip-image-sync             Do not build/import an image (configuration-only deploy).
  --identity-file <path>        Private SSH key. Default: ~/.ssh/liveproctoring_poc
  --terraform-dir <path>        Terraform directory. Default: ./terraform
  --help                        Show this help.

Without --image, the script builds mediasoup-poc:latest locally and imports it
directly into the one k3s server. The script reads mediasoup_public_ipv4 from
Terraform state, applies the base Kubernetes manifests, replaces
MEDIASOUP_LISTEN_IP in the ConfigMap, and waits for the rollout. KUBECONFIG
must point at the target k3s cluster.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE="${2:-}"
      shift 2
      ;;
    --terraform-dir)
      TERRAFORM_DIR="${2:-}"
      shift 2
      ;;
    --skip-image-sync)
      SKIP_IMAGE_SYNC="true"
      shift
      ;;
    --identity-file)
      IDENTITY_FILE="${2:-}"
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

if [[ -n "${IMAGE}" && "${SKIP_IMAGE_SYNC}" == "true" ]]; then
  echo "--image and --skip-image-sync cannot be used together" >&2
  exit 1
fi

for command in terraform kubectl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

PUBLIC_IP="$(terraform -chdir="${TERRAFORM_DIR}" output -raw mediasoup_public_ipv4)"

if [[ ! "${PUBLIC_IP}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Terraform output mediasoup_public_ipv4 is not a valid IPv4 address: ${PUBLIC_IP}" >&2
  exit 1
fi

echo "Deploying to Kubernetes context: $(kubectl config current-context)"
echo "Using mediasoup announced public IPv4: ${PUBLIC_IP}"

# Keep the stateful, host-networked mediasoup Pod on the k3s control-plane.
# This label is applied through Kubernetes rather than cloud-init so an
# ordinary deployment update never forces Terraform to replace the server.
kubectl label nodes -l node-role.kubernetes.io/control-plane workload=mediasoup --overwrite

if [[ -z "${IMAGE}" && "${SKIP_IMAGE_SYNC}" == "false" ]]; then
  for command in docker ssh; do
    if ! command -v "${command}" >/dev/null 2>&1; then
      echo "Missing required command for local image import: ${command}" >&2
      exit 1
    fi
  done

  IMAGE="mediasoup-poc:latest"
  echo "Building ${IMAGE} locally"
  docker build -t "${IMAGE}" "${REPO_ROOT}"

  echo "Importing ${IMAGE} into k3s on ${PUBLIC_IP}"
  SSH_OPTIONS=()
  if [[ -f "${IDENTITY_FILE}" ]]; then
    SSH_OPTIONS=(-i "${IDENTITY_FILE}")
  else
    echo "SSH identity file not found at ${IDENTITY_FILE}; using ssh-agent/default SSH configuration."
  fi
  docker save "${IMAGE}" | ssh "${SSH_OPTIONS[@]}" "root@${PUBLIC_IP}" 'k3s ctr images import -'
fi

kubectl apply -k "${KUSTOMIZE_DIR}"

kubectl -n liveproctoring create configmap mediasoup-poc-config \
  --from-literal="MEDIASOUP_LISTEN_IP=${PUBLIC_IP}" \
  --from-literal="MEDIASOUP_RTC_MIN_PORT=40000" \
  --from-literal="MEDIASOUP_RTC_MAX_PORT=40999" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

if [[ -n "${IMAGE}" ]]; then
  kubectl -n liveproctoring set image deployment/mediasoup-poc "app=${IMAGE}"
fi

# ConfigMap values are read when the container starts, so restart after the
# generated ConfigMap is applied.
kubectl -n liveproctoring rollout restart deployment/mediasoup-poc
kubectl -n liveproctoring rollout status deployment/mediasoup-poc
