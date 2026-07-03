"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useLogout } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  MessageSquare,
  LogOut,
  Hospital,
  BarChart3,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/chat", label: "AI Receptionist", icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <aside className="hidden md:flex md:flex-col h-full w-64 border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-4 border-b shrink-0">
        <Hospital className="h-5 w-5 text-primary" />
        <span className="font-semibold text-base">Harmony Health</span>
      </div>

      {/* Navigation — scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "font-medium"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          );
        })}

        {/* Analytics — ADMIN only */}
        {user?.role === "ADMIN" && (
          <Link href="/analytics">
            <Button
              variant={pathname.startsWith("/analytics") ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3",
                pathname.startsWith("/analytics") && "font-medium"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
          </Link>
        )}
      </nav>

      {/* User info + logout — pinned to bottom */}
      <div className="border-t px-4 py-3 space-y-2 shrink-0">
        <div className="px-2 text-sm text-muted-foreground truncate">
          {user?.username || "User"}
          <span className="block text-xs opacity-60">{user?.role}</span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
