"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const buttonClass =
  "flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]";

export function LoginButton() {
  const signIn = async () => {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <button type="button" onClick={signIn} className={buttonClass}>
      Entrar con Google
    </button>
  );
}

export function LogoutButton() {
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
  };

  return (
    <button type="button" onClick={signOut} className={buttonClass}>
      Cerrar sesión
    </button>
  );
}
