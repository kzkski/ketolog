import { redirect } from "next/navigation";
import { getSupabaseAuthForRequest } from "@/lib/supabase/request-auth";
import { getPresetRange, getTodayJstDate } from "@/lib/insights";
import {
  getInsightsBodyCompForDateRange,
  getInsightsDasForDateRange,
  getInsightsFoodLogForDateRange,
  getInsightsPfcTargetSnapshotsForDateRange,
  getInsightsTrainingBurnForDateRange,
} from "./actions";
import InsightsClient from "./InsightsClient";

export default async function InsightsPage() {
  const { user } = await getSupabaseAuthForRequest();
  if (!user) redirect("/login");

  const today = getTodayJstDate();
  const initialRange = getPresetRange(today, 7);
  const [foodResult, snapResult, dasResult, trainingResult, bodyResult] =
    await Promise.all([
      getInsightsFoodLogForDateRange(initialRange.start, initialRange.end),
      getInsightsPfcTargetSnapshotsForDateRange(initialRange.start, initialRange.end),
      getInsightsDasForDateRange(initialRange.start, initialRange.end),
      getInsightsTrainingBurnForDateRange(initialRange.start, initialRange.end),
      getInsightsBodyCompForDateRange(initialRange.start, initialRange.end),
    ]);

  return (
    <InsightsClient
      initialEntries={foodResult.entries}
      initialEnergyEntries={foodResult.entries}
      initialSnapshots={snapResult.snapshots}
      initialDasRows={dasResult.rows}
      initialTrainingRows={trainingResult.rows}
      initialBodyCompRows={bodyResult.rows}
      today={today}
    />
  );
}
