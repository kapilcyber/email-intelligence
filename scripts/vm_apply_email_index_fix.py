"""Apply emails.graph_id index fix on VM Postgres.

Usage (PowerShell):
  $env:VM_SSH_PASSWORD='...'
  python scripts/vm_apply_email_index_fix.py
"""

from __future__ import annotations

import os
import sys

import paramiko

HOST = "172.16.200.30"
SSH_USER = "email-int"

SQL_INDEXES = "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='emails' ORDER BY indexname;"

SQL_DDL = " ".join(
    """
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_graph_id_key;
DROP INDEX IF EXISTS ix_emails_graph_id;
CREATE INDEX IF NOT EXISTS ix_emails_graph_id ON emails (graph_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_mailbox_graph_id ON emails (mailbox_owner_email, graph_id)
  WHERE graph_id IS NOT NULL AND mailbox_owner_email IS NOT NULL;
""".strip().splitlines()
)


def main() -> None:
    pw = os.environ.get("VM_SSH_PASSWORD")
    if not pw:
        raise SystemExit("Set VM_SSH_PASSWORD")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=SSH_USER, password=pw, timeout=45)
    try:
        def run_psql(sql: str) -> tuple[int, str, str]:
            cmd = (
                "cd /opt/email-intelligence/email-intelligence; "
                "docker compose exec -T postgres psql -U postgres -d email_intelligence -v ON_ERROR_STOP=1 -c "
                + repr(sql)
            )
            _, stdout, stderr = ssh.exec_command(cmd)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            code = stdout.channel.recv_exit_status()
            return code, out, err

        code, out, err = run_psql(SQL_INDEXES)
        print("--- INDEXES BEFORE ---")
        if out.strip():
            print(out)
        if err.strip():
            print(err, file=sys.stderr)
        if code != 0:
            raise SystemExit(code)

        code, out, err = run_psql(SQL_DDL)
        print("--- DDL APPLY ---")
        if out.strip():
            print(out)
        if err.strip():
            print(err, file=sys.stderr)
        if code != 0:
            raise SystemExit(code)

        code, out, err = run_psql(SQL_INDEXES)
        print("--- INDEXES AFTER ---")
        if out.strip():
            print(out)
        if err.strip():
            print(err, file=sys.stderr)
        raise SystemExit(code)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()

