"use server";

import { getCurrentEbayConnection } from "@/server/ebaySession";

export async function getShellAccountAction(): Promise<{
  connected: boolean;
  username: string | null;
}> {
  try {
    const connection = await getCurrentEbayConnection();
    return {
      connected: connection.connected,
      username: connection.username ?? null,
    };
  } catch {
    return { connected: false, username: null };
  }
}
