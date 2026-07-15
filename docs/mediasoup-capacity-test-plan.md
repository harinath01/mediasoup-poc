# Mediasoup Capacity Test Notes

## Goal

Find the lowest-cost mediasoup server type that can handle 200 students plus
one staff member (201 concurrent participants) with 20-30% CPU and bandwidth
headroom.

Test one mediasoup server type at a time. The k6 runner type is separate: use
enough runners that Chromium load generation is not the bottleneck. The current
measured k6 capacity is **CPX32 = 3 browser users per runner**.

> **Result validity:** Do not use results collected before the staff consumer
> synchronization fix to size a 200-student server. Prometheus confirms that,
> during the 19:51-20:07 IST load test, consumer counts peaked at **699 open /
> 598 resumed** and then remained at **243 open / 226 resumed** from
> 19:55-20:02 IST.
> Two staff viewing a 20-student page should normally have about 40 resumed
> video consumers. The extra consumers were duplicates caused by overlapping
> producer-update synchronization, so they inflated server CPU and egress.
> Deploy the fix and repeat the capacity series from a clean server state.

Based on the current Hetzner prices you shared, test mediasoup candidates in
this order: **CPX32**, then **CPX42** (8 vCPU / 16 GB), then **CPX52** (12 vCPU
/ 24 GB) only if needed. Do not use CPX41 as the next candidate: the price
list shows it costs more than CPX42 for the same 8 vCPU / 16 GB capacity.

## Command reference

For each mediasoup server type, create the clean POC first and enter the
candidate type when prompted. This changes the server IP, so update the DNS
record when the script asks.

```bash
./deploy/setup-poc.sh
```

The first test command creates one CPX32 runner. When increasing the runner
count, omit `--reuse-runners` and `--skip-image-sync` once so Terraform creates
the new runners and imports the image. Reuse flags are only valid when the
cluster already has exactly the requested runner count.

### Series 0 - smoke: 3 users

```bash
./deploy/run-k6-browser-test.sh \
  --runners 1 --runner-type cpx32 \
  --rooms 1 --students-per-room 2 --staff-per-room 1 \
  --duration 5m --ramp-up 30s --keep-runners
```

### Series 1 - one-room baseline: 3 to 18 users

Use totals divisible by 3 so every CPX32 runner receives three browser users.
The 3-user smoke and 18-user baseline are complete.

Example: 18 users, one staff and 17 students, across six retained CPX32 k6
runners:

```bash
./deploy/run-k6-browser-test.sh \
  --runners 6 --runner-type cpx32 \
  --rooms 1 --students-per-room 17 --staff-per-room 1 \
  --duration 15m --ramp-up 2m \
  --keep-runners
```

### Series 2 - multiple rooms

Use the highest passing room size from Series 1 and increase the number of
rooms. Example: two rooms with eight students and one staff each:

```bash
./deploy/run-k6-browser-test.sh \
  --runners 6 --runner-type cpx32 \
  --rooms 2 --students-per-room 8 --staff-per-room 1 \
  --duration 15m --ramp-up 2m \
  --keep-runners --reuse-runners --skip-image-sync
```

### Series 3 - one-room capacity ramp: 36 to 150 users

Run each level for 15 minutes. Stop at the first repeatable quality or
stability failure; the previous passing level is the recommended capacity.

| Total users | CPX32 runners | Students / room |
| ---: | ---: | ---: |
| 36 | 12 | 35 |
| 72 | 24 | 71 |
| 120 | 40 | 119 |
| 150 | 50 | 149 |

For each new level, use this command pattern. Do not use reuse flags while
changing runner count: new CPX32 nodes need the browser image imported.

```bash
./deploy/run-k6-browser-test.sh \
  --runners <runner-count> --runner-type cpx32 \
  --rooms 1 --students-per-room <students-per-room> --staff-per-room 1 \
  --duration 15m --ramp-up 2m \
  --keep-runners
```

### Series 4 - 200 students plus one staff confirmation

Run this only after the 150-user level remains healthy. This is 201 total
participants, which divides evenly into 67 CPX32 runners with three browser
users per runner. This first 67-runner command creates the additional runners
and imports the image, so it does not use reuse flags.

```bash
./deploy/run-k6-browser-test.sh \
  --runners 67 --runner-type cpx32 \
  --rooms 1 --students-per-room 200 --staff-per-room 1 \
  --duration 15m --ramp-up 10m \
  --keep-runners
```

### Series 5 - 201-participant endurance

Run the same 201-participant load for 60 minutes:

```bash
./deploy/run-k6-browser-test.sh \
  --runners 67 --runner-type cpx32 \
  --rooms 1 --students-per-room 200 --staff-per-room 1 \
  --duration 60m --ramp-up 10m \
  --keep-runners --reuse-runners --skip-image-sync
```

Record values after ramp-up and every 15 minutes. A camera-plus-screen-share
series needs a k6 screen-share scenario first; the current test is camera/audio
only.

## What to watch in Grafana

Use these two dashboards:

- **Mediasoup Overview** - media server and browser quality.
- **Kubernetes / Compute Resources / Pod** - select namespace
  `liveproctoring` and the `mediasoup-poc-...` Pod for app CPU, memory, and
  network use.

| What to check | Dashboard -> panel | Healthy value / result |
| --- | --- | --- |
| Worker CPU | **Mediasoup Overview** -> **Worker CPU** | This is one mediasoup worker process, measured against one CPU core—not total four-core server use. Under 70% sustained; caution at 70-80%; fail above 80% for 3 minutes. |
| App CPU | **Kubernetes / Compute Resources / Pod** -> **CPU Usage** and **CPU Throttling** | CPU stays below about 3 cores on CPX32; throttling stays near zero. |
| App memory | **Kubernetes / Compute Resources / Pod** -> **Memory Usage (WSS)** and **Memory Quota** | Rises during ramp-up, then becomes stable; no restart or OOM. |
| Worker memory | **Mediasoup Overview** -> **Worker memory** | Rises during ramp-up, then becomes stable. Continuous growth is a warning. |
| RTP send and available outgoing | **Mediasoup Overview** -> **RTP bitrate** | Send is the egress/cost value. Available outgoing must remain comfortably above send. |
| Server NIC traffic | **Kubernetes / Compute Resources / Pod** -> **Transmit Bandwidth** and **Receive Bandwidth** | This POC uses `hostNetwork`, so this panel reflects the media-server NIC, not mediasoup-only Pod traffic. Use it to observe host traffic, not directly as an application egress-cost value. |
| Rooms, transports, producers, consumers | **Mediasoup Overview** top stat cards | Counts match the intended rooms and participants. |
| Worker health and deaths | **Mediasoup Overview** top stat cards | Health = 1; deaths = 0. Any death fails the level. |
| RTT, jitter, loss, NACK/PLI/FIR | **Mediasoup Overview** -> **RTP quality** and **Control signals** | RTT under 150 ms, jitter under 30 ms, and no sharp rising loss/control-signal trend. |
| Staff experience | **Mediasoup Overview** -> **k6 Browser WebRTC** staff cards | RTT/jitter/loss stay stable; decoded and rendered FPS do not drop for long periods. |
| Student experience | **Mediasoup Overview** -> **k6 Browser WebRTC** student cards | Outbound bitrate and encoded FPS stay stable; no rising remote packet-loss trend. |

Mark a level as failed if joins/ICE fail, a worker dies, CPU stays above 80%,
memory keeps rising, media quality drops sharply, or packet loss/RTT/jitter
keep increasing under steady load.

## Run notes

| Date / run | Mediasoup server type | Rooms | Staff / room | Students / room | Total users | k6 runners | Worker CPU avg / peak | RTP send avg / peak Mbps | Available outgoing avg / peak Mbps | Staff RTT / jitter / loss | Student FPS / loss | Result | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- |
| 2026-07-14 15:27-15:32 IST | CPX32 / 1 worker | 1 | 1 | 2 | 3 | 1 CPX32 | 2.04% / 2.85% | 30.6 / 90.1 kbps | 1.76 / 2.43 | RTT 0.51-1.80 ms; jitter 88.78-268.29; loss 0 | Staff loss 0; student remote loss 0 | Recorded | All 3 users joined. PLI reached 29. |
| 2026-07-14 15:51-16:06 IST | CPX32 / 1 worker | 2 | 1 | 8 | 18 | 6 CPX32 | 10.68% / 12.46% | 0.282 / 0.703 | 19.09 / 38.88 | Staff RTT p95 max 2.65 ms; jitter p95 max 17.53 ms; lost counter max 865 | Encoded FPS metric about 2; remote lost counter max 1 | Recorded - 18/18 joined | Worker RSS average 13.87 MiB, peak 14.38 MiB. Peak: 19 transports, 34 producers, 38 consumers. Packets lost max 3; NACK max 4; PLI max 151; FIR 0. |
| 2026-07-14 16:11-16:28 IST | CPX32 / 1 worker | 2 | 1 | 8 | 18 | 6 CPX32 | 9.51% / 12.13% | 0.318 / 0.497 | 22.60 / 38.88 | Staff RTT p95 max 2.25 ms; jitter p95 max 45.28 ms; lost counter max 6,321 | Encoded FPS metric about 2; remote lost counter max 2 | Recorded - 18/18 joined | Worker RSS average 54.10 MiB, peak 54.98 MiB. Peak: 20 transports, 32 producers, 38 consumers. Packets lost max 14; NACK max 16; PLI max 291; FIR 0. |
| 2026-07-14 16:56-17:12 IST | CPX32 / 1 worker | 1 | 1 | 35 | 36 | 12 CPX32 | 17.39% / 22.05% | 0.459 / 1.231 | 28.04 / 47.92 | Staff RTT p95 max 3.00 ms; jitter p95 max 12.67 ms; lost counter max 2 | Encoded FPS metric about 2; remote lost counter max 24 | Recorded | Worker RSS average 16.95 MiB, peak 17.94 MiB. Peak: 37 transports, 70 producers, 75 consumers. Packets lost max 45; NACK max 29; PLI max 1,417; FIR 0. |
| 2026-07-14 18:30-18:50 IST | CPX32 / 1 worker | 1 | 2 | 118 | 120 | 40 CPX32 | 35.37% / 51.95% | 1.355 / 2.554 | 95.67 / 160.45 | Staff RTT p95 max 12.20 ms; jitter p95 max 3.92 ms; lost counter max 7,158 | Encoded FPS metric about 2; remote lost counter max 2 | Recorded | Worker RSS average 87.24 MiB, peak 95.52 MiB. Peak: 121 transports, 236 producers, 381 consumers. Packets lost max 9; NACK max 36; PLI max 2,878; FIR 0. |
| 2026-07-14 20:13-20:30 IST | CPX32 / 1 worker | 1 | 1 | 200 | 201 | 67 CPX32 | 54.02% / 68.20% | 0.310 / 1.413 | 20.79 / 82.62 | Staff RTT p95 max 1.90 ms; jitter p95 max 8.79 ms; lost counter max 2,770 | Student remote loss counter max 2; encoded-FPS remote-write value was not usable | **CPU target met — egress audit incomplete** | Worker RSS avg / peak 32.90 / 36.13 MiB. Peak: 202 transports, 400 producers, 98 consumers (68 resumed). This is far below the earlier duplicate spike, but still above the roughly 20-21 expected for one staff page. Packets lost max 9; NACK max 23; PLI max 749. One k6 runner exited with code 2. |

### Media-server host NIC bandwidth

Values come from **Kubernetes / Compute Resources / Pod** -> **Transmit
Bandwidth** and **Receive Bandwidth**, queried from Prometheus over each Run
notes time window. Because the mediasoup Pod uses `hostNetwork`, cAdvisor's
network counter is the server NIC counter (pause container / `eth0`), not
mediasoup-only traffic. Do not use these values directly for egress pricing.

| Run window | Users | Host NIC transmit avg / peak Mbps | Host NIC receive avg / peak Mbps |
| --- | ---: | ---: | ---: |
| 15:27-15:32 | 3 | 0.227 / 0.666 | 0.739 / 0.907 |
| 15:51-16:06 | 18 | 0.819 / 1.990 | 6.312 / 7.177 |
| 16:11-16:28 | 18 | 0.839 / 1.905 | 5.684 / 6.800 |
| 16:56-17:12 | 36 | 1.688 / 5.444 | 12.194 / 14.680 |
| 18:30-18:50 | 120 | 15.709 / 116.587 | 36.273 / 49.403 |
| 20:13-20:30 | 201 | 50.900 / 549.642 | 70.820 / 85.921 |

The 19:51-20:07 IST load test is excluded from capacity sizing because
Prometheus recorded duplicate media forwarding: a peak of 699 open / 598
resumed consumers, followed by 243 open / 226 resumed consumers for two staff.
Do not extrapolate its CPU or bandwidth values to a 200-student session.

## Capacity result

| Mediasoup server type | Highest passing users | First failed users | Bottleneck | RTP send average Mbps | Recommended production users | Notes |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| CPX32 | **201 (200 students + 1 staff)** | Not reached in this POC | No CPU or memory limit reached | **Not validated** | **200 students + 1 staff (CPU POC)** | The single mediasoup worker peaked at 68.20% of one core. This does not represent total four-core server CPU. Egress cost and a full 201/201 completion result remain unverified. |

## Before production cost approval

- Add cumulative mediasoup transport `bytesSent` / `rtpBytesSent` Prometheus
  counters and derive egress rates from counter deltas.
- Compare those rates with the dedicated server NIC after establishing an idle
  baseline, then cross-check the total with Hetzner traffic reporting.
- Resolve why one staff member reached 68 resumed consumers and why one k6
  runner exited with code 2 in the 201-participant run.

Estimated egress for one session:

```text
egress_GB = average_RTP_send_bps * session_seconds / 8 / 1,000,000,000
```

Use the measured RTP send average to estimate traffic cost. Select the least
expensive server type whose recommended production users reaches 200.
