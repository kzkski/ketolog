import { createClient } from "@/lib/supabase/server";
import { seedUserData } from "@/lib/seed";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // 新規ユーザーの場合のみシードを投入（user_settings がなければ初回）
      const { data: settings } = await supabase
        .from("user_settings")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!settings) {
        await seedUserData(supabase, data.user.id);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
