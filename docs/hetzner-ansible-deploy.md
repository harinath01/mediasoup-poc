# Hetzner Deployment With Ansible

This repository now includes a bootstrap path for provisioning a fresh Hetzner Ubuntu machine, building the app, and starting it under `supervisor`.

## What it does

The deployment flow is:

1. connect to the server with password-based SSH
2. create the `ubuntu` user from the provided root credentials
3. sync the local repository to the remote machine
4. install OS dependencies, Node.js, and `pnpm`
5. install server and client dependencies
6. build the server and the client
7. configure `supervisor`
8. install `nginx` and request a Let's Encrypt certificate for the domain
9. proxy `https://<domain>` to the backend

The production process is only the Node.js backend. The frontend is served from `client/dist` by Express.
`nginx` terminates TLS and proxies to the backend on `127.0.0.1:3001`.

## Local requirements

Install these on the machine that runs the deployment.

Recommended on Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y pipx sshpass rsync openssh-client
pipx install 'ansible-core>=2.16,<2.19'
```

macOS with Homebrew:

```bash
brew install ansible sshpass rsync
```

Required tools:

- `ansible-playbook`
- `sshpass`
- `rsync`
- `ssh`

Avoid Ubuntu's older distro `ansible` package for this workflow. It can fail during module transfer and fact gathering.

## Remote assumptions

- Fresh Hetzner server with working `root` SSH login
- password authentication is enabled
- `liveproctoring.tpsentinel.com` resolves to the Hetzner server IP before certificate issuance

## Usage

```bash
chmod +x deploy/bootstrap-hetzner.sh

deploy/bootstrap-hetzner.sh \
  --host <server-public-ip> \
  --root-password '<root-password>' \
  --user ubuntu \
  --user-password '<ubuntu-password>' \
  --domain liveproctoring.tpsentinel.com
```

Optional with a real Let's Encrypt contact email:

```bash
deploy/bootstrap-hetzner.sh \
  --host <server-public-ip> \
  --root-password '<root-password>' \
  --user ubuntu \
  --user-password '<ubuntu-password>' \
  --domain liveproctoring.tpsentinel.com \
  --letsencrypt-email you@example.com
```

Optional flags:

- `--public-ip` to override the mediasoup announced IP
- `--app-dir` to change the remote install path
- `--port` to change the backend port
- `--node-version` to change the Node.js major version
- `--pnpm-version` to pin a different pnpm version
- `--root-user` to override the initial bootstrap user, default `root`
- `--letsencrypt-email` to register the certificate with an email address

## Notes

- The deployment sets `MEDIASOUP_LISTEN_IP` from the supplied public IP instead of relying on local interface detection.
- The bootstrap script creates `ubuntu`, grants it passwordless sudo, and then uses that account for the rest of the deployment.
- The service is installed in supervisor as `mediasoup-poc`.
- After deployment, open `https://liveproctoring.tpsentinel.com/` instead of hitting port `3001` directly.

## Redeploy after enabling HTTPS

If you already ran the bootstrap once before the HTTPS changes, just rerun the same command. The playbook is designed to update the machine in place.

## Smoke test

```bash
curl -I https://liveproctoring.tpsentinel.com
curl https://liveproctoring.tpsentinel.com/api/rooms
```

Expected result:

- `200 OK` for `/`
- JSON response for `/api/rooms`

Camera and microphone checks should now be done via:

- `https://liveproctoring.tpsentinel.com/`
- `https://liveproctoring.tpsentinel.com/student`
- `https://liveproctoring.tpsentinel.com/staff`
