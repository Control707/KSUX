import {
  AlertTriangle,
  Bell,
  Bookmark,
  BookOpen,
  Bus,
  Calendar,
  Car,
  Compass,
  GraduationCap,
  Home,
  MessageSquare,
  Shield,
  ShieldAlert,
  Search,
  ShoppingBag,
  Sparkles,
  Trophy,
  User,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefix used to mark the destination active. */
  match?: string;
}

/** Desktop rail groups (SPEC-v2 §3). */
export const RAIL_GROUPS: { label: string; items: Destination[] }[] = [
  {
    label: "Everyday",
    items: [
      { href: "/", label: "Now", icon: Home },
      { href: "/search", label: "Search", icon: Search },
      { href: "/feed", label: "Feed", icon: Compass },
      { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
      { href: "/chats", label: "Chats", icon: MessageSquare },
      { href: "/scrappy", label: "Ask Scrappy", icon: Sparkles },
    ],
  },
  {
    label: "Campus life",
    items: [
      { href: "/parking", label: "Parking", icon: Car },
      { href: "/transit", label: "Transit", icon: Bus },
      { href: "/study", label: "Study Rooms", icon: BookOpen },
      { href: "/dining", label: "Dining", icon: Utensils },
      { href: "/events", label: "Events", icon: Calendar },
      { href: "/clubs", label: "Clubs", icon: Users },
      { href: "/courses/CS%203305", label: "Course Hubs", icon: GraduationCap, match: "/courses" },
      { href: "/safety", label: "Safety", icon: ShieldAlert },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/agenda", label: "Private agenda", icon: Calendar },
      { href: "/profile", label: "Profile", icon: User, match: "/profile" },
      { href: "/saved", label: "Saved", icon: Bookmark },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/profile/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

/** Quick Sheet chips: every destination plus the Incident report entry. */
export const QUICK_SHEET_CHIPS: Destination[] = [
  ...RAIL_GROUPS.flatMap((g) => g.items),
  { href: "/safety?report=1", label: "Report an incident", icon: AlertTriangle },
];

export const MODERATION_DESTINATION: Destination = { href: "/moderation", label: "Moderation", icon: Shield };

export function isActive(pathname: string, item: Destination): boolean {
  const base = item.match ?? item.href.split("?")[0]!;
  if (base === "/") return pathname === "/";
  if (base === "/profile") return pathname === "/profile";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Chat threads and Ask Scrappy hide the bottom bar and show a Back header. */
export function isFocusedComposerRoute(pathname: string): boolean {
  return /^\/chats\/[^/]+/.test(pathname) || pathname === "/scrappy";
}
