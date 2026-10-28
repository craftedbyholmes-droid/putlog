import { LayoutDashboard, Users, FolderKanban, FileText, CalendarDays, ClipboardCheck, Files, Boxes, HardHat, Clock, Receipt, BarChart3, Settings, TowerControl, type LucideIcon } from "lucide-react";

/** The final navigation. Sections not built yet still appear, so nothing moves when they go live. */
export type NavItem = { href: string; label: string; icon: LucideIcon; live: boolean; mobile?: boolean };
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, live: true, mobile: true },
  { href: "/clients", label: "Clients", icon: Users, live: true },
  { href: "/jobs", label: "Jobs", icon: FolderKanban, live: true, mobile: true },
  { href: "/quotes", label: "Quotes", icon: FileText, live: true },
  { href: "/haki", label: "HAKI tower", icon: TowerControl, live: true },
  { href: "/board", label: "Board", icon: CalendarDays, live: true, mobile: true },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck, live: true },
  { href: "/documents", label: "Documents", icon: Files, live: true, mobile: true },
  { href: "/stock", label: "Stock", icon: Boxes, live: false },
  { href: "/workers", label: "Workers", icon: HardHat, live: false },
  { href: "/timesheets", label: "Timesheets", icon: Clock, live: false },
  { href: "/invoices", label: "Invoices", icon: Receipt, live: false },
  { href: "/reports", label: "Reports", icon: BarChart3, live: false },
  { href: "/settings", label: "Settings", icon: Settings, live: true },
];
