import { redirect } from "next/navigation";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { getPresetRange, getTodayJstDate } from "@/lib/insights";
import {
  getInsightsFoodLogForDateRange,
  getInsightsPfcTargetSnapshotsForDateRange,
} from "./actions";
import InsightsClient from "./InsightsClient";

export default async function InsightsPage() {
  const { user } = await getSupabaseAuthForRequest();
  if (!user) redirect("/login");

  const today = getTodayJstDate();
  const initialRange = getPresetRange(today, 7);
  const [foodResult, snapResult] = await Promise.all([
    getInsightsFoodLogForDateRange(initialRange.start, initialRange.end),
    getInsightsPfcTargetSnapshotsForDateRange(initialRange.start, initialRange.end),
  ]);

  return (
    <InsightsClient
      initialEntries={foodResult.entries}
      initialSnapshots={snapResult.snapshots}
      today={today}
    />
  );
}
