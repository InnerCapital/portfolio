import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { allowedDomain, emailAllowed } from "@/lib/access";

export { allowedDomain, adminEmails, emailAllowed, isKeyholder } from "@/lib/access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: { hd: process.env.ALLOWED_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // The hd parameter above is only a UI hint, so the domain is enforced here on the server.
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      const hd = (profile as { hd?: string } | undefined)?.hd?.toLowerCase();
      return (
        profile?.email_verified === true &&
        emailAllowed(email) &&
        hd === allowedDomain()
      );
    },
  },
});
