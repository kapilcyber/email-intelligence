"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";

const OUTLOOK_EMBED_STORAGE_KEY = "email-intelligence-embedded-host";
const OUTLOOK_CONTEXT_STORAGE_KEY = "email-intelligence-outlook-context";

declare global {
  interface Window {
    Office?: any;
  }
}

type OutlookContext = {
  mailbox: string;
  itemId: string;
  restId: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
};

function normalizeAddress(entry: any): string {
  if (!entry) return "";
  const email = entry.emailAddress || entry.address || "";
  const name = entry.displayName || entry.name || "";
  if (name && email && name !== email) return `${name} <${email}>`;
  return email || name || "";
}

function normalizeAddressList(entries: any): string[] {
  const list = Array.isArray(entries) ? entries : [];
  return list.map(normalizeAddress).filter(Boolean);
}

function getStringValue(source: any): Promise<string> {
  if (typeof source === "string") return Promise.resolve(source);
  if (source && typeof source.getAsync === "function") {
    return new Promise((resolve) => {
      source.getAsync((result: any) => {
        if (result?.status === window.Office?.AsyncResultStatus?.Succeeded) {
          resolve(result.value || "");
          return;
        }
        resolve("");
      });
    });
  }
  return Promise.resolve("");
}

function getRecipients(source: any): Promise<string[]> {
  if (Array.isArray(source)) return Promise.resolve(normalizeAddressList(source));
  if (source && typeof source.getAsync === "function") {
    return new Promise((resolve) => {
      source.getAsync((result: any) => {
        if (result?.status === window.Office?.AsyncResultStatus?.Succeeded) {
          resolve(normalizeAddressList(result.value));
          return;
        }
        resolve([]);
      });
    });
  }
  return Promise.resolve([]);
}

function buildDashboardUrl(context: OutlookContext | null): string {
  const url = new URL("/dashboard", window.location.origin);
  url.searchParams.set("host", "outlook");
  url.searchParams.set("source", "outlook-addin");
  if (!context) return url.toString();
  if (context.mailbox) url.searchParams.set("outlookMailbox", context.mailbox);
  if (context.subject) url.searchParams.set("outlookSubject", context.subject);
  if (context.from) url.searchParams.set("outlookFrom", context.from);
  if (context.itemId) url.searchParams.set("outlookItemId", context.itemId);
  if (context.restId) url.searchParams.set("outlookRestId", context.restId);
  return url.toString();
}

export default function OutlookEntryPage() {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState("Loading Outlook context...");

  useEffect(() => {
    if (!scriptReady) return;
    const office = (window as Window & { Office?: any }).Office;
    if (!office) {
      try {
        window.sessionStorage.setItem(OUTLOOK_EMBED_STORAGE_KEY, "outlook");
      } catch {}
      router.replace("/dashboard?host=outlook&source=outlook-addin");
      return;
    }

    office.onReady(async () => {
      const mailbox = office.context?.mailbox;
      const item = mailbox?.item;
      if (!mailbox || !item) {
        setStatus("Outlook item context is unavailable. Opening dashboard...");
        try {
          window.sessionStorage.setItem(OUTLOOK_EMBED_STORAGE_KEY, "outlook");
        } catch {}
        router.replace("/dashboard?host=outlook&source=outlook-addin");
        return;
      }

      const subject = await getStringValue(item.subject);
      const to = await getRecipients(item.to);
      const cc = await getRecipients(item.cc);
      const context: OutlookContext = {
        mailbox: mailbox.userProfile?.emailAddress || "",
        itemId: item.itemId || "",
        restId: "",
        subject,
        from: normalizeAddress(item.from),
        to,
        cc,
      };

      if (context.itemId && mailbox.convertToRestId && office.MailboxEnums?.RestVersion) {
        try {
          context.restId = mailbox.convertToRestId(context.itemId, office.MailboxEnums.RestVersion.v2_0);
        } catch {
          context.restId = "";
        }
      }

      try {
        window.sessionStorage.setItem(OUTLOOK_EMBED_STORAGE_KEY, "outlook");
        window.sessionStorage.setItem(OUTLOOK_CONTEXT_STORAGE_KEY, JSON.stringify(context));
      } catch {}

      setStatus("Opening Email Intelligence inside Outlook...");
      router.replace(buildDashboardUrl(context));
    });
  }, [router, scriptReady]);

  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <main className="flex min-h-[100dvh] items-center justify-center bg-app-gradient px-4 py-8">
        <div className="glass-surface w-full max-w-sm rounded-2xl p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Email Intelligence</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{status}</p>
        </div>
      </main>
    </>
  );
}
