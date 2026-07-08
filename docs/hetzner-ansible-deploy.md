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
8. start the backend, which also serves the built frontend

The production process is only the Node.js backend. The frontend is served from `client/dist` by Express.

## Local requirements

Install these on the machine that runs the deployment.

Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y ansible sshpass rsync openssh-client
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

## Remote assumptions

- Fresh Hetzner server with working `root` SSH login
- password authentication is enabled

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

Optional flags:

- `--public-ip` to override the mediasoup announced IP
- `--app-dir` to change the remote install path
- `--port` to change the backend port
- `--node-version` to change the Node.js major version
- `--pnpm-version` to pin a different pnpm version
- `--root-user` to override the initial bootstrap user, default `root`

## Notes

- The deployment sets `MEDIASOUP_LISTEN_IP` from the supplied public IP instead of relying on local interface detection.
- The bootstrap script creates `ubuntu`, grants it passwordless sudo, and then uses that account for the rest of the deployment.
- The service is installed in supervisor as `mediasoup-poc`.
- After deployment, the application is served from the backend port, default `3001`.
