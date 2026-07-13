# Browser Session Test

Single-script k6 browser test for mediasoup student/staff sessions:

- script: `load_testing/mediasoup-session-test.js`
- model: each VU is one deterministic participant
- flow: join once, hold session, leave

## Production Kubernetes runner image

Every distributed k6 runner must have the same Chromium fake camera and
microphone inputs. A file on a Hetzner node is **not** automatically visible
inside a Kubernetes Pod, so do not download media directly to `/root` or a
node-local directory.

Instead, build the immutable runner image defined in
`load_testing/Dockerfile.browser`. It contains:

- k6 `2.0.0` and Chromium from `grafana/k6:2.0.0-with-browser`;
- this test and `helper.js` under `/test`;
- video: `/opt/k6/fake-media/WebCam30s.y4m`;
- audio: `/opt/k6/fake-media/ambient-sounds-96000hz-24bit.wav`.

The image downloads the supplied source files during its build and verifies
their SHA-256 hashes. Each temporary k6 node obtains the image when the
Kubernetes runner Pod is scheduled, so every Chromium process uses identical
media without a hostPath mount or a separate per-node setup step.

Build it locally:

```bash
docker build \
  --tag mediasoup-k6-browser:2.0.0 \
  --file load_testing/Dockerfile.browser \
  load_testing
```

For the multi-node Hetzner test, this image must be made available to **every**
k6 worker. The next deployment script will either import this tag into each
k3s agent or, preferably, push it to a private container registry and use an
immutable registry tag. Do not use `latest` for a load-test image.

The Kubernetes `TestRun` will use:

```yaml
script:
  localFile: /test/mediasoup-session-test.js
runner:
  image: mediasoup-k6-browser:2.0.0
```

`K6_BROWSER_ARGS` is already set in the image. Override it only when you
intentionally want different fake media.

## Browser Prerequisite

k6 browser tests require a local Chromium-compatible browser binary.

If you see:

```text
k6 couldn't detect google chrome or a chromium-supported browser on this system
```

then install Chrome/Chromium first, or point k6 at an existing browser with:

```bash
K6_BROWSER_EXECUTABLE_PATH=/abs/path/to/chrome-or-chromium
```

Examples of valid binaries:

- `google-chrome`
- `google-chrome-stable`
- `chromium`
- `chromium-browser`

### Install Chromium / Chrome

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y chromium-browser
```

If `chromium-browser` is unavailable on your distro release:

```bash
sudo apt update
sudo apt install -y chromium
```

Fedora:

```bash
sudo dnf install -y chromium
```

Arch:

```bash
sudo pacman -S chromium
```

If you want Google Chrome instead of Chromium on Debian/Ubuntu:

```bash
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
```

After install, verify the binary:

```bash
which google-chrome google-chrome-stable chromium chromium-browser
```

## Required Inputs

Script env vars:

- `BASE_URL`
- `ROOM_COUNT`
- `STUDENTS_PER_ROOM`
- `STAFF_PER_ROOM`
- `SESSION_DURATION`
- `RAMP_UP`

Optional script env vars:

- `ROOM_PREFIX`
- `STUDENT_NAME_PREFIX`
- `STAFF_NAME_PREFIX`
- `HOLD_LOOP_INTERVAL`
- `STAFF_START_BUFFER`
- `PER_ROOM_STAFF_OFFSET`

## WebRTC browser metrics

The test automatically opens student and staff pages with `?k6Telemetry=1`.
Only with that query parameter, the client exposes its own mediasoup transport
statistics to the k6 browser page. No normal user page exposes this test API.

The test emits these custom metrics:

- Staff: `webrtc_staff_inbound_bitrate_bps`, `webrtc_staff_packets_lost`,
  `webrtc_staff_jitter_milliseconds`, `webrtc_staff_rtt_milliseconds`,
  `webrtc_staff_decoded_fps`, and `webrtc_staff_rendered_fps`.
- Student: `webrtc_student_outbound_bitrate_bps`,
  `webrtc_student_rtt_milliseconds`, `webrtc_student_encoded_fps`, and
  `webrtc_student_remote_packets_lost` when Chromium provides remote receiver
  feedback for the outbound video stream.

Bitrate and FPS are calculated from consecutive browser snapshots. A counter
is emitted for packet loss, so it is safe to graph its increase/rate over time.

## Local Prometheus and Grafana

Upgrade the local monitoring stack after this change so its Prometheus instance
accepts k6 remote-write output, then apply the dashboard:

```bash
export KUBECONFIG="$(k3d kubeconfig write liveproctoring-local)"

helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values k8s/monitoring/values.yaml

kubectl apply -f k8s/monitoring/mediasoup-dashboard.yaml
```

In one terminal, forward the local Prometheus remote-write endpoint:

```bash
kubectl -n monitoring port-forward service/kube-prometheus-stack-prometheus 9090:9090
```

Then add these environment values to a local k6 run:

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://127.0.0.1:9090/api/v1/write
K6_PROMETHEUS_RW_TREND_STATS=avg,p(95),p(99)
K6_PROMETHEUS_RW_STALE_MARKERS=true
```

Use k6's Prometheus remote-write output (`-o experimental-prometheus-rw`).
Grafana's **Mediasoup Overview** dashboard includes a **k6 Browser WebRTC**
section for these metrics.

Browser/media env vars:

- `K6_BROWSER_HEADLESS=true|false`
- `K6_BROWSER_EXECUTABLE_PATH=/abs/path/to/chrome-or-chromium`
- `K6_BROWSER_ARGS=...`

## Fake Media

For a local run, pass Chromium fake-media flags through `K6_BROWSER_ARGS`:

```bash
K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=load_testing/fake_media/long-audio-5min-44100hz-16bit.wav'
```

Notes:

- fake video file: `load_testing/fake_media/Johnny_1280x720_60.y4m`
- fake audio file: `load_testing/fake_media/long-audio-5min-44100hz-16bit.wav`
- these are Chromium launch flags, not script env vars

For production Kubernetes runs, use the runner image above instead of these
repository-relative local paths.

## Distributed Hetzner k6 browser test

`deploy/run-k6-browser-test.sh` runs the full temporary-worker lifecycle:

1. creates the requested Hetzner k3s agent servers through Terraform;
2. waits for nodes labeled `workload=k6-browser` to become Ready;
3. installs the k6 Operator if needed;
4. builds and imports the browser image into the k3s server and every agent;
5. creates a distributed `TestRun` with one runner Pod per agent;
6. sends k6 and WebRTC metrics to the existing in-cluster Prometheus;
7. collects runner logs, removes the TestRun, and deletes the temporary agents.

Local prerequisites:

```bash
sudo apt update
sudo apt install -y jq gettext-base
```

You also need Terraform, Docker, `kubectl`, SSH, the POC SSH key, and
`HCLOUD_TOKEN` in the environment. Connect to the cluster first only when you
want to inspect it manually; the launcher refreshes the SSH kubeconfig tunnel
itself.

The first run after this Terraform change is special: Terraform must replace
the current k3s server because the server needs to be created with the
Terraform-managed join token. This causes app downtime and a new public IP, so
back up anything needed and explicitly pass `--allow-server-replacement` once.
The launcher restores the application, monitoring, and TLS setup, then pauses
for you to update the GoDaddy A record to the replacement server IP. Later
test runs only create and delete k6 agents.

### Example: one room, 200 participants, ten k6 servers

The test has 199 students and one staff participant. Ten runner Pods means 20
globally assigned VUs per runner:

```bash
export HCLOUD_TOKEN='your-hetzner-token'

./deploy/run-k6-browser-test.sh \
  --runners 10 \
  --runner-type cpx41 \
  --rooms 1 \
  --students-per-room 199 \
  --staff-per-room 1 \
  --duration 10m \
  --ramp-up 2m \
  --allow-server-replacement
```

Remove `--allow-server-replacement` after the one-time migration. Add
`--keep-runners` when diagnosing a run; otherwise the script removes the
temporary Hetzner servers even after a test failure.

The generated TestRun uses `parallelism` equal to `--runners` and
`separate: true`. With ten labeled k6 agents, Kubernetes schedules one runner
Job per agent. The script rejects a test whose participant count cannot be
split evenly across the selected runner count.

Open Grafana at `http://<mediasoup-server-ip>:30300`, then select
**Mediasoup Overview**. The **k6 Browser WebRTC** row shows staff inbound
bitrate/loss/jitter/RTT/FPS and student outbound bitrate/RTT/FPS/loss feedback.

## Smoke

```bash
K6_BROWSER_HEADLESS=true \
K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=load_testing/fake_media/long-audio-5min-44100hz-16bit.wav' \
k6 run \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e ROOM_COUNT=1 \
  -e STUDENTS_PER_ROOM=2 \
  -e STAFF_PER_ROOM=1 \
  -e SESSION_DURATION=1m \
  -e RAMP_UP=10s \
  load_testing/mediasoup-session-test.js
```

## Load

```bash
K6_BROWSER_HEADLESS=true \
K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=load_testing/fake_media/long-audio-5min-44100hz-16bit.wav' \
k6 run \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e ROOM_COUNT=5 \
  -e STUDENTS_PER_ROOM=10 \
  -e STAFF_PER_ROOM=1 \
  -e SESSION_DURATION=10m \
  -e RAMP_UP=30s \
  load_testing/mediasoup-session-test.js
```

## Soak

```bash
K6_BROWSER_HEADLESS=true \
K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=load_testing/fake_media/long-audio-5min-44100hz-16bit.wav' \
k6 run \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e ROOM_COUNT=5 \
  -e STUDENTS_PER_ROOM=10 \
  -e STAFF_PER_ROOM=1 \
  -e SESSION_DURATION=45m \
  -e RAMP_UP=30s \
  load_testing/mediasoup-session-test.js
```
