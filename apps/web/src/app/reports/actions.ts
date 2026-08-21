"use server";

import {
  fetchOpenReports,
  resolveReport,
  type SellerAlertDto,
} from "@/server/reports";
import type { ActionResult } from "@/server/conversations";

export async function listReportsAction(): Promise<
  ActionResult<SellerAlertDto[]>
> {
  return fetchOpenReports();
}

export async function resolveReportAction(
  alertId: string,
): Promise<ActionResult<{ id: string }>> {
  return resolveReport(alertId);
}
