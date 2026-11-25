import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/guard";
import Vault from "@/components/Vault";
import TopBar from "@/components/TopBar";
import { MFA_COOKIE } from "@/lib/mfaCookie";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  // /mfa sends people without a Google session on to /login.
  if (!user) redirect("/mfa");

  return (
    <>
      <TopBar>
        {user.admin && (
          <a href="/audit" className="navlink">
            Audit log
          </a>
        )}
        <span className="who tiny">{user.email}</span>
        <form
          action={async () => {
            "use server";
            (await cookies()).delete(MFA_COOKIE);
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="btn small" type="submit">
            Sign out
          </button>
        </form>
      </TopBar>
      <Vault admin={user.admin} keyholder={user.keyholder} email={user.email} />
    </>
  );
}
