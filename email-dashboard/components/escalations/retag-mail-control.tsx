"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  emailId: string;
  /** If set, admin retag for this mailbox */
  adminMailbox?: string | null;
  /** Optional preset list (e.g. admin already loaded teams); otherwise loads /api/retag/department-options */
  departmentNames?: string[];
  onDone: () => void;
  compact?: boolean;
};

export function RetagMailControl({
  emailId,
  adminMailbox,
  departmentNames: presetNames,
  onDone,
  compact,
}: Props) {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [departments, setDepartments] = useState<string[]>(presetNames ?? []);
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (presetNames?.length) {
      setDepartments(presetNames);
      return;
    }
    if (status !== "authenticated") return;
    api
      .getRetagDepartmentOptions()
      .then((r) => setDepartments(r.departments ?? []))
      .catch(() => setDepartments([]));
  }, [status, api, presetNames]);

  const run = () => {
    if (!value) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    const p = adminMailbox?.trim()
      ? api.retagEmailAdmin(emailId, adminMailbox.trim(), value)
      : api.retagEmail(emailId, value);
    p.then((res) => {
      setValue("");
      if (res.mode === "request") {
        setInfo(res.message || "Approval request sent to admin.");
      } else {
        setInfo("Mail moved to ReTag.");
      }
      onDone();
    })
      .catch((e: Error) => setErr(e.message || "Retag failed"))
      .finally(() => setBusy(false));
  };

  if (status !== "authenticated") return null;

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1" : "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"}>
      <Select value={value || "__pick__"} onValueChange={(v) => setValue(v === "__pick__" ? "" : v)}>
        <SelectTrigger className={compact ? "h-8 w-[130px] text-xs" : "h-9 w-[160px] text-xs"}>
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__pick__">Choose…</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="secondary" className="text-xs" disabled={!value || busy} onClick={run}>
        {busy ? "…" : "Retag"}
      </Button>
      {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
      {!err && info && <span className="text-xs text-emerald-600 dark:text-emerald-400">{info}</span>}
    </div>
  );
}
