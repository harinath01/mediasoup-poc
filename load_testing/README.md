# Browser Session Test

Single-script k6 browser test for mediasoup student/staff sessions:

- script: `load_testing/mediasoup-session-test.js`
- model: each VU is one deterministic participant
- flow: join once, hold session, leave

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

Browser/media env vars:

- `K6_BROWSER_HEADLESS=true|false`
- `K6_BROWSER_EXECUTABLE_PATH=/abs/path/to/chrome-or-chromium`
- `K6_BROWSER_ARGS=...`

## Fake Media

For student publishing in automated runs, pass Chromium fake-media flags through `K6_BROWSER_ARGS`:

```bash
K6_BROWSER_ARGS='use-fake-device-for-media-stream,use-fake-ui-for-media-stream,use-file-for-fake-video-capture=load_testing/fake_media/Johnny_1280x720_60.y4m,use-file-for-fake-audio-capture=load_testing/fake_media/long-audio-5min-44100hz-16bit.wav'
```

Notes:

- fake video file: `load_testing/fake_media/Johnny_1280x720_60.y4m`
- fake audio file: `load_testing/fake_media/long-audio-5min-44100hz-16bit.wav`
- these are Chromium launch flags, not script env vars

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
