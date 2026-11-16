"use client";
import { useEffect, useState } from "react";

let listeners: ((m: string) => void)[] = [];
export function toast(msg: string) { listeners.forEach((l) => l(msg)); }

export default function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const l = (m: string) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 3200); };
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); clearTimeout(t); };
  }, []);
  if (!msg) return null;
  return <div className="toast" role="status">{msg}</div>;
}
