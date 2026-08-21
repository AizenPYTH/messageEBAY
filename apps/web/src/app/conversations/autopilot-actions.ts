"use server";

import {
  fetchAutopilotStatus,
  runAutopilotNow,
  updateAutopilotEnabled,
} from "@/server/autopilot";

export async function getAutopilotStatusAction() {
  return fetchAutopilotStatus();
}

export async function setAutopilotEnabledAction(enabled: boolean) {
  return updateAutopilotEnabled(enabled);
}

export async function runAutopilotNowAction() {
  return runAutopilotNow();
}
