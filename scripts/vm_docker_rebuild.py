"""SSH to deployment host and rebuild core Docker Compose services."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "172.16.200.30"
SSH_USER = "email-int"
REMOTE_CMD = (
    "cd /opt/email-intelligence/email-intelligence && "
    "docker compose up -d --build backend dashboard worker beat"
)


def main() -> None:
    pw = os.environ.get("VM_SSH_PASSWORD")
    if not pw:
        sys.exit("Set VM_SSH_PASSWORD")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=SSH_USER, password=pw, timeout=45)
    try:
        t = ssh.get_transport()
        if t:
            t.set_keepalive(30)
        _, stdout, stderr = ssh.exec_command(REMOTE_CMD)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        if out.strip():
            print(out, end="" if out.endswith("\n") else "\n")
        if err.strip():
            print(err, file=sys.stderr, end="" if err.endswith("\n") else "\n")
        sys.exit(code)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
