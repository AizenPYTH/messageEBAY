"use server";

import { trainFromEbayHistory } from "@/server/train";

export async function trainFromHistoryAction() {
  return trainFromEbayHistory(40);
}
