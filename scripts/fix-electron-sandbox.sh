#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sandbox_binary="${project_root}/node_modules/electron/dist/chrome-sandbox"

if [[ ! -f "${sandbox_binary}" ]]; then
  echo "Electron's chrome-sandbox binary was not found." >&2
  echo "Run 'npm install' first, then retry this command." >&2
  exit 1
fi

echo "Configuring Electron's SUID sandbox helper..."
sudo chown root:root "${sandbox_binary}"
sudo chmod 4755 "${sandbox_binary}"

owner="$(stat -c '%U:%G' "${sandbox_binary}")"
mode="$(stat -c '%a' "${sandbox_binary}")"

if [[ "${owner}" != "root:root" || "${mode}" != "4755" ]]; then
  echo "Sandbox verification failed: owner=${owner}, mode=${mode}." >&2
  exit 1
fi

echo "Electron sandbox is ready: owner=${owner}, mode=${mode}."
echo "You can now run 'npm run dev'."
