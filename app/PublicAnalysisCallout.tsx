"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import DeepScanButton from "@/app/DeepScanButton";
import { browserDb } from "@/lib/supabase";
import { publicAnalysisAction } from "@/lib/publicAnalysisAction";

type Props = {
  extensionId: string;
  version: string;
  scanned: boolean;
  fullAnalysisHref?: string;
  initialSignedIn: boolean;
};

type SessionState = "checking" | "signed-in" | "signed-out";

export default function PublicAnalysisCallout({
  extensionId,
  version,
  scanned,
  fullAnalysisHref,
  initialSignedIn,
}: Props) {
  const db = useMemo(() => browserDb(), []);
  const [sessionState, setSessionState] = useState<SessionState>(
    initialSignedIn ? "signed-in" : "checking",
  );

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.user) {
          if (active) setSessionState("signed-in");
          return;
        }
      } catch {
        // Supabase remains the compatibility path when the session endpoint is unavailable.
      }

      try {
        const user = (await db?.auth.getUser())?.data.user;
        if (active) setSessionState(user ? "signed-in" : "signed-out");
      } catch {
        if (active) setSessionState("signed-out");
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [db]);

  const signedIn = sessionState === "signed-in";
  const action = publicAnalysisAction({
    extensionId,
    version,
    fullAnalysisHref,
    scanned,
    signedIn,
  });

  return (
    <section className="summaryBody">
      <div>
        <span className="kicker">Decision context</span>
        <h1>
          {scanned
            ? "Use this completed analysis before you install."
            : "Read the published evidence before you install."}
        </h1>
        <p>
          {scanned
            ? signedIn
              ? "Open the full analysis to inspect the evidence and make a workspace decision."
              : "This is a plain-language summary of the completed analysis for this exact extension version. Technical evidence and workspace actions are available after sign-in."
            : "Publisher documentation and release history are public. Request a Deep Scan when you need security evidence for this version."}
        </p>
      </div>
      <aside>
        {scanned ? (
          sessionState === "checking" ? (
            <button className="button buttonDark" type="button" disabled aria-busy="true">
              Checking sign-in…
            </button>
          ) : action.requiresSignIn ? (
            <Link className="button buttonDark" href={action.href}>
              {action.label}
              <ArrowRight size={16} />
            </Link>
          ) : (
            <a className="button buttonDark" href={action.href}>
              {action.label}
              <ShieldCheck size={16} />
            </a>
          )
        ) : (
          <DeepScanButton extensionId={extensionId} version={version} />
        )}
        <Link
          className="button buttonQuiet"
          href={`/extensions/${encodeURIComponent(extensionId)}`}
        >
          Read README and releases <FileText size={16} />
        </Link>
      </aside>
    </section>
  );
}
