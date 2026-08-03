import "server-only";
import OpenAI from "openai";
import { getSupabaseClient, listConversations } from "@/server/core";
import { hasUsableEbayToken, withEbayContext } from "@/server/ebaySession";
import { ensureServerEnv, hasEnv } from "@/server/env";

export type ServiceStatus = "ok" | "degraded" | "down" | "unconfigured";

export type ServiceHealth = {
  name: "eBay" | "OpenAI" | "Supabase";
  status: ServiceStatus;
  detail: string;
  latencyMs?: number;
};

export type DashboardKpis = {
  conversations: number | null;
  messagesToday: number | null;
  repliesGenerated: number | null;
  repliesSent: number | null;
  repliesValidated: number | null;
  avgResponseTimeMs: number | null;
  openaiCostUsd: number | null;
  conversationsSynced: number | null;
  lastSyncAt: string | null;
};

async function checkEbay(): Promise<ServiceHealth> {
  ensureServerEnv();
  if (!hasEnv("EBAY_CLIENT_ID")) {
    return {
      name: "eBay",
      status: "unconfigured",
      detail: "Credentials app manquants",
    };
  }

  const usable = await hasUsableEbayToken();
  if (!usable) {
    return {
      name: "eBay",
      status: "unconfigured",
      detail: "Compte eBay non connecté",
    };
  }

  const started = Date.now();
  try {
    await withEbayContext(() => listConversations("FROM_MEMBERS", 1));
    return {
      name: "eBay",
      status: "ok",
      detail: "Message API joignable",
      latencyMs: Date.now() - started,
    };
  } catch (error: unknown) {
    return {
      name: "eBay",
      status: "down",
      detail: error instanceof Error ? error.message : "Erreur eBay",
      latencyMs: Date.now() - started,
    };
  }
}

async function checkOpenAi(): Promise<ServiceHealth> {
  ensureServerEnv();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      name: "OpenAI",
      status: "unconfigured",
      detail: "OPENAI_API_KEY manquante",
    };
  }

  const started = Date.now();
  try {
    const client = new OpenAI({ apiKey });
    const page = await client.models.list();
    const first = page.data[0]?.id;
    return {
      name: "OpenAI",
      status: "ok",
      detail: first ? `API joignable (${first})` : "API joignable",
      latencyMs: Date.now() - started,
    };
  } catch (error: unknown) {
    return {
      name: "OpenAI",
      status: "down",
      detail: error instanceof Error ? error.message : "Erreur OpenAI",
      latencyMs: Date.now() - started,
    };
  }
}

async function checkSupabase(): Promise<ServiceHealth> {
  ensureServerEnv();
  if (!hasEnv("SUPABASE_URL") || !hasEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    return {
      name: "Supabase",
      status: "unconfigured",
      detail: "URL ou service role manquants",
    };
  }

  const started = Date.now();
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .schema("ebay_ai")
      .from("conversations")
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        name: "Supabase",
        status: "degraded",
        detail: error.message,
        latencyMs: Date.now() - started,
      };
    }

    return {
      name: "Supabase",
      status: "ok",
      detail: "Schema ebay_ai accessible",
      latencyMs: Date.now() - started,
    };
  } catch (error: unknown) {
    return {
      name: "Supabase",
      status: "down",
      detail: error instanceof Error ? error.message : "Erreur Supabase",
      latencyMs: Date.now() - started,
    };
  }
}

async function countExact(table: string): Promise<number | null> {
  try {
    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .schema("ebay_ai")
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function getServiceHealth(): Promise<ServiceHealth[]> {
  ensureServerEnv();
  return Promise.all([checkEbay(), checkOpenAi(), checkSupabase()]);
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  ensureServerEnv();

  const [conversations, repliesGenerated, messages] = await Promise.all([
    countExact("conversations"),
    countExact("ai_replies"),
    countExact("messages"),
  ]);

  let repliesSent: number | null = null;
  let lastSyncAt: string | null = null;

  try {
    const supabase = getSupabaseClient();

    const sent = await supabase
      .schema("ebay_ai")
      .from("ai_replies")
      .select("id", { count: "exact", head: true })
      .eq("sent_to_ebay", true);
    repliesSent = sent.error ? null : (sent.count ?? 0);

    const latest = await supabase
      .schema("ebay_ai")
      .from("conversations")
      .select("updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = latest.data as
      | { updated_at?: string | null; created_at?: string | null }
      | null;
    lastSyncAt = row?.updated_at ?? row?.created_at ?? null;
  } catch {
    // KPIs stay null when DB is unavailable
  }

  return {
    conversations,
    messagesToday: messages,
    repliesGenerated,
    repliesSent,
    repliesValidated: null,
    avgResponseTimeMs: null,
    openaiCostUsd: null,
    conversationsSynced: conversations,
    lastSyncAt,
  };
}
