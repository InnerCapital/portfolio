"use client";
import { useRouter } from "next/navigation";

export default function DisconnectButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button className="btn quiet sm" type="button" style={{ marginLeft: 8 }} onClick={async () => {
      if (!confirm("Disconnect this account? Synced posts and comments will be removed.")) return;
      await fetch("/api/instagram/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      router.refresh();
    }}>Disconnect</button>
  );
}
