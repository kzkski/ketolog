import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex-1 p-4">
      <div className="flex justify-end mb-4">
        <LogoutButton />
      </div>
      <p className="text-gray-400 text-sm text-center mt-20">
        Phase 1 で食事記録UIを実装します
      </p>
    </main>
  );
}
