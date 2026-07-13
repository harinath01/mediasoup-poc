output "mediasoup_server_name" {
  description = "Hetzner server name."
  value       = hcloud_server.mediasoup.name
}

output "mediasoup_public_ipv4" {
  description = "Public IPv4 address. Point liveproctoring.tpsentinel.com here and use it as MEDIASOUP_LISTEN_IP."
  value       = hcloud_server.mediasoup.ipv4_address
}

output "mediasoup_ssh_command" {
  description = "SSH command for the server created by this Terraform root."
  value       = "ssh root@${hcloud_server.mediasoup.ipv4_address}"
}

output "k6_runner_public_ipv4s" {
  description = "Public IPv4 addresses of temporary k6 browser runner agents."
  value       = hcloud_server.k6_runner[*].ipv4_address
}

output "k6_runner_server_names" {
  description = "Names of temporary k6 browser runner agents."
  value       = hcloud_server.k6_runner[*].name
}
