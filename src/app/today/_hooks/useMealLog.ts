"use client";

import { useState } from "react";
import type { FoodLogEntry, TodayConsumed } from "@/types/database";
import { deleteFoodLogEntry, getFoodLogForDate } from "../actions/food-log";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatNavDate(dateStr: string, today: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const label = `${d.getMonth() + 1}/${d.getDate()}（${DAY_LABELS[d.getDay()]}）`;
  return dateStr === today ? `今日 ${label}` : label;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("sv-SE");
}

type UseMealLogParams = {
  today: string;
  todayConsumed: TodayConsumed;
  initialLogEntries: FoodLogEntry[];
};

export function useMealLog({
  today,
  todayConsumed,
  initialLogEntries,
}: UseMealLogParams) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [consumedForDate, setConsumedForDate] = useState(todayConsumed);
  const [logEntries, setLogEntries] = useState<FoodLogEntry[]>(initialLogEntries);
  const [loadingDate, setLoadingDate] = useState(false);
  const [showLogEntries, setShowLogEntries] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);

  async function loadDate(dateStr: string) {
    if (dateStr > today) return;
    setSelectedDate(dateStr);
    setLoadingDate(true);
    const result = await getFoodLogForDate(dateStr);
    setLoadingDate(false);
    if (!result.error) {
      setConsumedForDate(result.consumed);
      setLogEntries(result.entries);
      setShowLogEntries(dateStr !== today);
    }
  }

  async function navigateDate(delta: number) {
    const newDate = addDays(selectedDate, delta);
    await loadDate(newDate);
  }

  async function goToToday() {
    await loadDate(today);
  }

  async function refreshLogForDate(date: string) {
    const result = await getFoodLogForDate(date);
    if (!result.error) {
      setConsumedForDate(result.consumed);
      setLogEntries(result.entries);
    }
  }

  async function handleDeleteEntry(id: string) {
    const previousEntries = logEntries;
    const previousConsumed = consumedForDate;
    const entry = logEntries.find((e) => e.id === id);

    setLogEntries((prev) => prev.filter((e) => e.id !== id));
    if (entry) {
      setConsumedForDate((prev) => ({
        protein: prev.protein - entry.protein_g,
        fat: prev.fat - entry.fat_g,
        carbs: prev.carbs - entry.carbs_g,
      }));
    }

    const result = await deleteFoodLogEntry(id);
    if (result.error) {
      alert(result.error);
      setLogEntries(previousEntries);
      setConsumedForDate(previousConsumed);
    }
  }

  return {
    selectedDate,
    consumedForDate,
    setConsumedForDate,
    logEntries,
    setLogEntries,
    loadingDate,
    showLogEntries,
    setShowLogEntries,
    editingEntry,
    setEditingEntry,
    loadDate,
    navigateDate,
    goToToday,
    refreshLogForDate,
    handleDeleteEntry,
  };
}
