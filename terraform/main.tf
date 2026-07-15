locals {
  common_labels = {
    project = var.project_name
    role    = "mediasoup"
    managed = "terraform"
  }
}

resource "hcloud_ssh_key" "admin" {
  name       = var.ssh_key_name
  public_key = file(pathexpand(var.ssh_public_key_path))
  labels     = local.common_labels
}

# This value is stored in Terraform state. Keep the state private: anyone with
# this token can add a node to this k3s cluster.
resource "random_password" "k3s_token" {
  length  = 48
  special = false
}

resource "hcloud_server" "mediasoup" {
  name        = "${var.project_name}-mediasoup-1"
  server_type = var.server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.admin.id]
  labels = merge(local.common_labels, {
    "k3s-node-role" = "server"
  })
  # A token change must replace the server: cloud-init only runs on first boot.
  lifecycle {
    replace_triggered_by = [random_password.k3s_token]
  }

  # k3s includes Traefik by default. The app, monitoring stack, and later k6
  # TestRuns are deliberately deployed separately through Kubernetes manifests.
  user_data = <<-CLOUD_INIT
    #cloud-config
    package_update: true
    packages:
      - curl
    runcmd:
      - curl -sfL https://get.k3s.io | sh -s - server --token '${random_password.k3s_token.result}' --write-kubeconfig-mode 0644
  CLOUD_INIT
}

resource "hcloud_server" "k6_runner" {
  count       = var.k6_runner_count
  name        = format("%s-k6-browser-%02d", var.project_name, count.index + 1)
  server_type = var.k6_runner_server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.admin.id]
  labels = merge(local.common_labels, {
    "k3s-node-role" = "agent"
    workload        = "k6-browser"
  })

  # The POC deliberately uses the server's public IPv4 for joining. It avoids
  # a private Hetzner network while keeping worker-to-server setup automatic.
  user_data = <<-CLOUD_INIT
    #cloud-config
    package_update: true
    packages:
      - curl
    runcmd:
      - curl -sfL https://get.k3s.io | K3S_URL=https://${hcloud_server.mediasoup.ipv4_address}:6443 K3S_TOKEN='${random_password.k3s_token.result}' sh -s - agent --with-node-id --node-label workload=k6-browser --node-taint workload=k6-browser:NoSchedule
  CLOUD_INIT
}
