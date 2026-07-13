# Terraform infrastructure

This directory creates the **persistent** Hetzner server for the POC:

- one Ubuntu 24.04 server;
- k3s, including its bundled Traefik, installed by cloud-init;
- an SSH key registered in Hetzner Cloud.

This POC intentionally does not create or manage Hetzner Cloud firewall rules.

It intentionally does **not** deploy the mediasoup container, Prometheus, or
Grafana. Those remain Kubernetes resources in `../k8s`. It also does not change
GoDaddy DNS; create or update the `liveproctoring.tpsentinel.com` A record after
Terraform outputs the server IPv4 address.

## Prerequisites

1. Install Terraform 1.6 or later.
2. Create a Hetzner Cloud API token with read/write access.
3. Export the token in the shell. Never put it in a `.tfvars` file or commit it.

```bash
export HCLOUD_TOKEN='your-hetzner-api-token'
```

## Create and register an SSH key

Terraform uses an SSH public key to give you secure `root` access to the new
server. It uploads the public key to Hetzner Cloud and attaches it to the
server automatically, so you do **not** need to add the key manually in the
Hetzner console.

Create a dedicated key for this POC on your local machine (skip this command
if you deliberately want to reuse an existing key):

```bash
ssh-keygen -t ed25519 -C 'liveproctoring-poc' -f ~/.ssh/liveproctoring_poc
```

When prompted for a passphrase, use one if this is a personal workstation. The
two resulting files have different purposes:

```text
~/.ssh/liveproctoring_poc       private key — keep secret; never commit or share it
~/.ssh/liveproctoring_poc.pub   public key — Terraform uploads this to Hetzner
```

Copy the example variables file and set the path to the **public** key:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

```hcl
# terraform.tfvars
ssh_public_key_path = "~/.ssh/liveproctoring_poc.pub"
ssh_key_name        = "liveproctoring-poc-admin"
```

On `terraform apply`, the `hcloud_ssh_key` resource registers this public key
in Hetzner Cloud and the `hcloud_server` resource installs it for `root`. After
the server is created, verify access with:

```bash
SERVER_IP=$(terraform output -raw mediasoup_public_ipv4)
ssh -i ~/.ssh/liveproctoring_poc root@"${SERVER_IP}"
```

If SSH asks whether to trust the server fingerprint on the first connection,
verify it against the Hetzner console before answering `yes`.

## Create the mediasoup server

For the guided first-time setup, return to the repository root and run:

```bash
./deploy/setup-poc.sh
```

It prompts for the Hetzner server type, location, SSH key, and Grafana
password; creates the server; deploys the app and monitoring; waits for your
GoDaddy DNS update; and then configures HTTPS.

To run the infrastructure step by step instead:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: at minimum, set ssh_public_key_path.
terraform init
terraform plan
terraform apply
```

Get the IP address:

```bash
terraform output -raw mediasoup_public_ipv4
```

Then:

1. Point the GoDaddy A record for `liveproctoring.tpsentinel.com` at that IP.
2. Wait for k3s to finish installing, then run `../deploy/connect-k3s.sh` from
   the repository root. It securely copies the kubeconfig, creates the local
   SSH tunnel on local port `16443`, and verifies that the node is ready.
3. Deploy with `../deploy/apply-k3s.sh`. By default, it builds the application
   image locally and imports it directly into this one k3s server. The script
   reads this Terraform output and sets `MEDIASOUP_LISTEN_IP` automatically.

For example, after `KUBECONFIG` is configured for this server:

```bash
../deploy/apply-k3s.sh
```

It uses `~/.ssh/liveproctoring_poc` by default for the image import. If your
key has a different path, pass `--identity-file /path/to/private-key`.

The tunnel can be checked or stopped later with:

```bash
../deploy/connect-k3s.sh status
../deploy/connect-k3s.sh stop
```

For a later multi-node setup, push the image to a registry and pass it
explicitly instead:

```bash
../deploy/apply-k3s.sh --image registry.example.com/mediasoup-poc:latest
```

## Destroy the POC server

This removes the server managed by this Terraform state:

```bash
terraform destroy
```

Run this only when the complete POC server can be deleted. The later k6 runner
module will use a separate server count, so its temporary runners can be
created and removed without destroying this mediasoup server.
