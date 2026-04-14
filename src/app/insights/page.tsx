import { redirect } from "next/navigation";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { getPresetRange, getTodayJstDate } from "@/lib/insights";
import { getInsightsFoodLogForDateRange } from "./actions";
import InsightsClient from "./InsightsClient";

export default async function InsightsPage() {
  const { user } = await getSupabaseAuthForRequest();
  if (!user) redirect("/login");

  const today = getTodayJstDate();
  const initialRange = getPresetRange(today, 7);
  const result = await getInsightsFoodLogForDateRange(initialRange.start, initialRange.end);

  return <InsightsClient initialEntries={result.entries} today={today} />;
}
