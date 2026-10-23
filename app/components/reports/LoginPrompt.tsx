"use client";

import { createClient } from "@/utils/supabase/client";

/** Login con Google que, al terminar, vuelve a la página indicada (solo rutas internas). */
export function LoginPrompt({ next, message }: { next: string; message: string }) {
  const signIn = async () => {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white px-6 py-8 text-center dark:border-white/[.145] dark:bg-zinc-950">
      <p className="text-base text-zinc-700 dark:text-zinc-300">{message}</p>
      <button
        type="button"
        onClick={signIn}
        className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Entrar con Google
      </button>
    </div>
  );
}
