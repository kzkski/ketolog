/**
 * Web / Mobile で共有する型（DTO 等）の置き場。
 * DB 行型の正は引き続き `src/types/database.ts`（Web 側）を参照。
 */
export type { PfcGrams } from "@ketolog/domain/pfc";
export type { MealType } from "@ketolog/domain/meal-timezone";
export type {
  ClaudeIntegrationSessionStatus,
  ClaudeIntegrationUsageGuide,
} from "@ketolog/domain/claude-integration";

import type {
  ClaudeIntegrationSessionStatus,
  ClaudeIntegrationUsageGuide,
} from "@ketolog/domain/claude-integration";

export type ClaudeIntegrationSessionDto = {
  id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  status: ClaudeIntegrationSessionStatus;
};

export type ClaudeIntegrationIssueResponseDto = {
  session: ClaudeIntegrationSessionDto;
  refresh_token: string;
  usage: ClaudeIntegrationUsageGuide;
};

export type ClaudeIntegrationSessionsListDto = {
  sessions: ClaudeIntegrationSessionDto[];
  limits: {
    max_active: number;
    active_count: number;
  };
};
