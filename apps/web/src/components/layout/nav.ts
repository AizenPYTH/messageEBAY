import type { ComponentType, SVGProps } from "react";
import {
  IconBug,
  IconChart,
  IconHistory,
  IconLayoutDashboard,
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

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
  { href: "/conversations", label: "Conversations", icon: IconMessages },
  { href: "/replies", label: "Réponses IA", icon: IconSparkles },
  { href: "/seller-profile", label: "Seller Profile", icon: IconUser },
  { href: "/history", label: "Historique", icon: IconHistory },
  { href: "/stats", label: "Statistiques", icon: IconChart },
  { href: "/settings/connections", label: "Paramètres", icon: IconSettings },
];

export const DEV_NAV: NavItem[] = [
  { href: "/debug", label: "Debug", icon: IconBug, badge: "dev" },
];
