#!/usr/bin/env bash

# Create temporary k6 agent nodes, execute one distributed browser TestRun,
# gather its logs, then remove the TestRun and agents unless --keep-runners is set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/terraform"
TEMPLATE="${REPO_ROOT}/load_testing/k8s/testrun-template.yaml"
IDENTITY_FILE="${SSH_IDENTITY_FILE:-${HOME}/.ssh/liveproctoring_poc}"
BASE_URL="https://liveproctoring.tpsentinel.com"
K6_BROWSER_IMAGE="mediasoup-k6-browser:2.0.0"
RUNNERS=""
RUNNER_TYPE="cpx41"
ROOM_COUNT="1"
STUDENTS_PER_ROOM="19"
STAFF_PER_ROOM="1"
SESSION_DURATION="5m"
RAMP_UP="30s"
RUNNER_CPU="4"
RUNNER_MEMORY="8Gi"
KEEP_RUNNERS="false"
TEST_RUN_NAME=""
RUNNERS_CREATED="false"
ALLOW_SERVER_REPLACEMENT="false"
SERVER_REPLACED="false"
RESTORE_CLUSTER="false"
PLAN_FILE=""
MANIFEST=""

usage() {
  cat <<'EOF'
Usage: deploy/run-k6-browser-test.sh --runners <count> [options]

Options:
  --runners <count>              Temporary k6 agent count / TestRun parallelism. Required.
  --runner-type <type>           Hetzner type per k6 agent. Default: cpx41.
  --base-url <url>               App URL. Default: https://liveproctoring.tpsentinel.com.
  --rooms <count>                Room count. Default: 1.
  --students-per-room <count>    Student VUs per room. Default: 19.
  --staff-per-room <count>       Staff VUs per room. Default: 1.
  --duration <duration>          Session duration. Default: 5m.
  --ramp-up <duration>           Participant ramp-up. Default: 30s.
  --runner-cpu <quantity>        CPU request/limit per runner Pod. Default: 4.
  --runner-memory <quantity>     Memory request/limit per runner Pod. Default: 8Gi.
  --image <tag>                  Browser image tag. Default: mediasoup-k6-browser:2.0.0.
  --allow-server-replacement      Explicitly allow the one-time current k3s server replacement.
  --keep-runners                 Keep Hetzner agents and TestRun resources after completion.
  --identity-file <path>         SSH private key. Default: ~/.ssh/liveproctoring_poc.
  --help                         Show this help.

Example: one room, 199 students plus one staff member across ten servers:
  deploy/run-k6-browser-test.sh --runners 10 --rooms 1 --students-per-room 199 --staff-per-room 1 --duration 10m

The first run after adopting this Terraform code replaces the current k3s
server so it can use the Terraform-managed join token. Review Terraform's plan
and take a backup before that one-time migration.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runners) RUNNERS="${2:-}"; shift 2 ;;
    --runner-type) RUNNER_TYPE="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --rooms) ROOM_COUNT="${2:-}"; shift 2 ;;
    --students-per-room) STUDENTS_PER_ROOM="${2:-}"; shift 2 ;;
    --staff-per-room) STAFF_PER_ROOM="${2:-}"; shift 2 ;;
    --duration) SESSION_DURATION="${2:-}"; shift 2 ;;
    --ramp-up) RAMP_UP="${2:-}"; shift 2 ;;
    --runner-cpu) RUNNER_CPU="${2:-}"; shift 2 ;;
    --runner-memory) RUNNER_MEMORY="${2:-}"; shift 2 ;;
    --image) K6_BROWSER_IMAGE="${2:-}"; shift 2 ;;
    --allow-server-replacement) ALLOW_SERVER_REPLACEMENT="true"; shift ;;
    --keep-runners) KEEP_RUNNERS="true"; shift ;;
    --identity-file) IDENTITY_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

is_positive_integer() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }
for value in "$RUNNERS" "$ROOM_COUNT" "$STUDENTS_PER_ROOM" "$STAFF_PER_ROOM"; do
  is_positive_integer "$value" || { echo "Runner and participant counts must be positive whole numbers." >&2; exit 1; }
done

TOTAL_VUS=$((ROOM_COUNT * (STUDENTS_PER_ROOM + STAFF_PER_ROOM)))
if (( TOTAL_VUS % RUNNERS != 0 )); then
  echo "${TOTAL_VUS} total VUs cannot be split evenly across ${RUNNERS} runners." >&2
  echo "Choose a runner count that divides ${TOTAL_VUS}." >&2
  exit 1
fi

for command in terraform kubectl docker ssh envsubst jq; do
  command -v "${command}" >/dev/null 2>&1 || { echo "Missing required command: ${command}" >&2; exit 1; }
done

[[ -f "${IDENTITY_FILE}" ]] || { echo "SSH identity file not found: ${IDENTITY_FILE}" >&2; exit 1; }

cleanup() {
  local exit_code="$?"
  if [[ -n "${TEST_RUN_NAME}" && "${KEEP_RUNNERS}" != "true" ]]; then
    kubectl -n liveproctoring delete testrun "${TEST_RUN_NAME}" --ignore-not-found >/dev/null 2>&1 || true
  fi
  if [[ "${KEEP_RUNNERS}" != "true" && "${RUNNERS_CREATED}" == "true" ]]; then
    terraform -chdir="${TERRAFORM_DIR}" apply -auto-approve -var="k6_runner_count=0" -var="k6_runner_server_type=${RUNNER_TYPE}" || true
  fi
  rm -f "${PLAN_FILE}" "${MANIFEST}"
  exit "${exit_code}"
}
trap cleanup EXIT

echo "Creating ${RUNNERS} temporary ${RUNNER_TYPE} k6 browser agent(s)"
terraform -chdir="${TERRAFORM_DIR}" init
PLAN_FILE="$(mktemp)"
terraform -chdir="${TERRAFORM_DIR}" plan -out="${PLAN_FILE}" \
  -var="k6_runner_count=${RUNNERS}" \
  -var="k6_runner_server_type=${RUNNER_TYPE}"

SERVER_REPLACEMENT="$(terraform -chdir="${TERRAFORM_DIR}" show -json "${PLAN_FILE}" | jq -r '[.resource_changes[] | select(.address == "hcloud_server.mediasoup") | select((.change.actions | index("create")) and (.change.actions | index("delete")))] | length > 0')"
if [[ "${SERVER_REPLACEMENT}" == "true" && "${ALLOW_SERVER_REPLACEMENT}" != "true" ]]; then
  cat >&2 <<'EOF'
Terraform plans to replace the existing mediasoup/k3s server. This is expected
only for the first migration to the Terraform-managed k3s join token, but it
will interrupt the app and change its public IP. Review the plan, take any
needed backup, then rerun with --allow-server-replacement to continue.
EOF
  exit 1
fi
SERVER_REPLACED="${SERVER_REPLACEMENT}"
terraform -chdir="${TERRAFORM_DIR}" apply -auto-approve "${PLAN_FILE}"
RUNNERS_CREATED="true"

"${SCRIPT_DIR}/connect-k3s.sh" stop >/dev/null 2>&1 || true
"${SCRIPT_DIR}/connect-k3s.sh" --identity-file "${IDENTITY_FILE}"
export KUBECONFIG="${HOME}/.kube/liveproctoring-k3s.yaml"

# A prior interrupted migration can leave a new, empty cluster. Detect the
# observable app deployment rather than relying only on this invocation's plan.
if ! kubectl -n liveproctoring get deployment/mediasoup-poc >/dev/null 2>&1; then
  RESTORE_CLUSTER="true"
fi

if [[ "${SERVER_REPLACED}" == "true" || "${RESTORE_CLUSTER}" == "true" ]]; then
  for command in helm getent; do
    command -v "${command}" >/dev/null 2>&1 || { echo "Missing required command after server replacement: ${command}" >&2; exit 1; }
  done

  if [[ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
    read -r -s -p 'New Grafana admin password for the replacement cluster: ' GRAFANA_ADMIN_PASSWORD
    echo
    [[ -n "${GRAFANA_ADMIN_PASSWORD}" ]] || { echo "Grafana password cannot be empty." >&2; exit 1; }
  fi

  echo "Restoring the mediasoup application and monitoring on the replacement cluster"
  "${SCRIPT_DIR}/apply-k3s.sh" --identity-file "${IDENTITY_FILE}"
  GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD}" "${SCRIPT_DIR}/setup-monitoring.sh"

  SERVER_IP="$(terraform -chdir="${TERRAFORM_DIR}" output -raw mediasoup_public_ipv4)"
  cat <<EOF

GoDaddy action required: update the A record before TLS can be restored.

  liveproctoring.tpsentinel.com -> ${SERVER_IP}

Press Enter after the DNS record has been updated.
EOF
  read -r
  until getent ahostsv4 liveproctoring.tpsentinel.com | awk '{print $1}' | sort -u | grep -qx "${SERVER_IP}"; do
    echo "DNS has not reached ${SERVER_IP} yet. Press Enter to check again."
    read -r
  done
  "${SCRIPT_DIR}/setup-tls.sh"
fi

echo "Waiting for ${RUNNERS} labeled k6 nodes to join"
for _ in {1..60}; do
  READY_RUNNERS="$(kubectl get nodes -l workload=k6-browser --no-headers 2>/dev/null | awk '$2 == "Ready" { count++ } END { print count + 0 }')"
  if [[ "${READY_RUNNERS}" == "${RUNNERS}" ]]; then
    break
  fi
  sleep 10
done
[[ "${READY_RUNNERS:-0}" == "${RUNNERS}" ]] || { echo "Timed out waiting for k6 agents." >&2; exit 1; }

"${SCRIPT_DIR}/setup-k6-operator.sh"

echo "Building ${K6_BROWSER_IMAGE}"
docker build --tag "${K6_BROWSER_IMAGE}" --file "${REPO_ROOT}/load_testing/Dockerfile.browser" "${REPO_ROOT}/load_testing"

SERVER_IP="$(terraform -chdir="${TERRAFORM_DIR}" output -raw mediasoup_public_ipv4)"
RUNNER_IPS="$(terraform -chdir="${TERRAFORM_DIR}" output -json k6_runner_public_ipv4s | jq -r '.[]')"
echo "Importing the browser image into the k3s server and each k6 agent"
for host in "${SERVER_IP}" ${RUNNER_IPS}; do
  docker save "${K6_BROWSER_IMAGE}" | ssh -i "${IDENTITY_FILE}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@${host}" 'k3s ctr images import -'
done

TEST_RUN_NAME="mediasoup-browser-$(date +%Y%m%d%H%M%S)"
export TEST_RUN_NAME K6_RUNNER_COUNT="${RUNNERS}" K6_BROWSER_IMAGE BASE_URL ROOM_COUNT STUDENTS_PER_ROOM STAFF_PER_ROOM SESSION_DURATION RAMP_UP
export K6_RUNNER_CPU="${RUNNER_CPU}" K6_RUNNER_MEMORY="${RUNNER_MEMORY}"
MANIFEST="$(mktemp)"
envsubst < "${TEMPLATE}" > "${MANIFEST}"

kubectl apply -f "${MANIFEST}"
echo "TestRun ${TEST_RUN_NAME} started: ${TOTAL_VUS} VUs / ${RUNNERS} runner Pods / $((TOTAL_VUS / RUNNERS)) VUs per runner"

while true; do
  STAGE="$(kubectl -n liveproctoring get testrun "${TEST_RUN_NAME}" -o jsonpath='{.status.stage}')"
  case "${STAGE}" in
    finished) break ;;
    error) echo "TestRun entered error state." >&2; kubectl -n liveproctoring describe testrun "${TEST_RUN_NAME}"; exit 1 ;;
    *) sleep 10 ;;
  esac
done

kubectl -n liveproctoring get pods -l "k6_cr=${TEST_RUN_NAME}" -o name | while read -r pod; do
  kubectl -n liveproctoring logs "${pod}" --all-containers=true || true
done

echo "TestRun finished. Browser and WebRTC metrics are available in Grafana."
if [[ "${KEEP_RUNNERS}" == "true" ]]; then
  echo "Keeping TestRun and Hetzner k6 agents as requested."
  TEST_RUN_NAME=""
fi
