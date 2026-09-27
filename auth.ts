import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const allowedDomain = "activezoneoutdoor.cy";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { hd: allowedDomain, prompt: "select_account" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email?.trim().toLowerCase();
      const hostedDomain = (profile as { hd?: string } | undefined)?.hd?.toLowerCase();
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;

      // The OAuth `hd` parameter is only a sign-in hint; enforce the domain here.
      return Boolean(
        email && email.endsWith(`@${allowedDomain}`) && hostedDomain === allowedDomain && verified === true,
      );
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email;
      return session;
    },
  },
};
