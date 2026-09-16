"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleUserRound, LayoutDashboard, LogOut, Radar } from "lucide-react";
import { browserDb } from "@/lib/supabase";

type HeaderUser = { email?: string | null };

export default function HeaderAccount() {
  const router = useRouter();
  const db = useMemo(() => browserDb(), []);
  const [user, setUser] = useState<HeaderUser | null | undefined>(undefined);
  const [provider, setProvider] = useState<"cloudflare" | "supabase" | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const cloudflareActive = { value: false };
    async function refresh() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.user) {
          cloudflareActive.value = true;
          if (active) {
            setUser({ email: String(body.user.email || "") });
            setProvider("cloudflare");
          }
          return;
        }
      } catch {
        // Supabase remains the compatibility path when the session endpoint is unavailable.
      }
      cloudflareActive.value = false;
      try {
        const result = await db?.auth.getUser();
        if (!active) return;
        setUser(result?.data.user || null);
        setProvider(result?.data.user ? "supabase" : null);
      } catch {
        if (active) {
          setUser(null);
          setProvider(null);
        }
      }
    }
    void refresh();
    const listener = db?.auth.onAuthStateChange((_event, session) => {
      if (cloudflareActive.value) return;
      setUser(session?.user || null);
      setProvider(session?.user ? "supabase" : null);
      void refresh();
    });
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshOnVisibility);
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => { active = false; cloudflareActive.value = false; listener?.data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", refreshOnVisibility); document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [db]);

  async function signOut() {
    if (provider === "cloudflare") await fetch("/api/auth/logout", { method: "POST" });
    else await db?.auth.signOut();
    setUser(null);
    setProvider(null);
    setOpen(false); router.replace("/");
  }

  return <div className="headerAccountSlot" ref={root}>
    {user === undefined ? <span className="headerAccountLoading" role="status" aria-label="Checking account" /> : user ? <>
      <button className="headerAccountButton" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><CircleUserRound/></button>
      {open ? <div className="headerAccountMenu" role="menu"><span>Signed in to GUARDRAILS</span><strong>{user.email || "GUARDRAILS account"}</strong><Link role="menuitem" href="/workspace" onClick={() => setOpen(false)}><LayoutDashboard/> Workspace</Link><Link role="menuitem" href="/monitor" onClick={() => setOpen(false)}><Radar/> Monitor releases</Link><Link role="menuitem" href="/account" onClick={() => setOpen(false)}><CircleUserRound/> Account</Link><button role="menuitem" onClick={() => void signOut()}><LogOut/> Sign out</button></div> : null}
    </> : <Link className="headerSignIn" href="/account">Sign in</Link>}
  </div>;
}
