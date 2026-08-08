"use server";

/**
 * Persisting the chosen palette.
 *
 * Split out of the settings action file because the header's theme picker is
 * on every page, and importing the whole settings module for one column write
 * would drag its dependencies into every route.
 *
 * Expected failures are RETURNED — Next masks thrown server-action messages in
 * production, and "the theme didn't save" is worth telling someone about.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";

const THEMES = ["Midnight", "Daylight", "Azure", "Orchid"];

export type ThemeResult = { ok: true } | { ok: false; error: string };

export async function setUiTheme(theme: string): Promise<ThemeResult> {
  if (!THEMES.includes(theme)) return { ok: false, error: "Unknown theme" };

  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("businesses").update({ ui_theme: theme }).eq("id", businessId);
  // RLS decides who may write this; a viewer's update matches no rows and
  // returns no error, which is the right outcome — their session still shows
  // the theme they picked, the business's saved default is unchanged.
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
