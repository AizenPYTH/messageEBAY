import type { ComponentType, SVGProps } from "react";
import {
  IconMessages,
  IconSettings,
  IconSparkles,
  IconUser,
} from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: string;
};

/** Minimal seller-facing navigation — everything else stays reachable by URL if needed. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/conversations", label: "Messages", icon: IconMessages },
  { href: "/train", label: "Entraîner", icon: IconSparkles },
  { href: "/seller-profile", label: "Mon style", icon: IconUser },
  { href: "/settings/connections", label: "Compte eBay", icon: IconSettings },
];

export const DEV_NAV: NavItem[] = [];
