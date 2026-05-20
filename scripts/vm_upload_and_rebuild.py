"""Upload local changed files to the VM and rebuild services.

PowerShell:
  $env:VM_SSH_PASSWORD='...'
  python scripts/vm_upload_and_rebuild.py
"""

from __future__ import annotations

import os
import posixpath
import sys

import paramiko

HOST = "172.16.200.30"
SSH_USER = "email-int"
REMOTE_ROOT = "/opt/email-intelligence/email-intelligence"

# Keep this list explicit so we only upload intended app code.
FILES = [
    "backend/app/ai/classifier.py",
    "backend/app/api/dashboard.py",
    "backend/app/api/emails.py",
    "backend/app/api/queue.py",
    "backend/app/config.py",
    "backend/app/db/models.py",
    "backend/app/db/session.py",
    "backend/app/workers/celery_app.py",
    "backend/app/workers/tasks.py",
    "backend/requirements.txt",
    "backend/alembic/versions/015_email_graph_id_per_mailbox.py",
    "email-dashboard/app/(dashboard)/dashboard/page.tsx",
    "email-dashboard/app/(dashboard)/queue/page.tsx",
    "email-dashboard/lib/types/index.ts",
]


def _ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.split("/")
    cur = ""
    for p in parts:
        if not p:
            continue
        cur += "/" + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def main() -> None:
    pw = os.environ.get("VM_SSH_PASSWORD")
    if not pw:
        raise SystemExit("Set VM_SSH_PASSWORD")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=SSH_USER, password=pw, timeout=45)
    try:
        sftp = ssh.open_sftp()
        try:
            for f in FILES:
                remote_path = posixpath.join(REMOTE_ROOT, f)
                _ensure_remote_dir(sftp, posixpath.dirname(remote_path))
                sftp.put(f, remote_path)
                print(f"uploaded: {f}")
        finally:
            sftp.close()

        # Rebuild + restart services (worker/beat rebuild from backend context).
        cmd = (
            f"cd {REMOTE_ROOT}; "
            "docker compose up -d --build backend worker beat dashboard"
        )
        _, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        if out.strip():
            print(out)
        if err.strip():
            print(err, file=sys.stderr)
        raise SystemExit(code)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()

