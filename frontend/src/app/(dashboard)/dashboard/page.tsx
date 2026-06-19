"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CalendarClock, MessageSquare, ClipboardList, Stethoscope } from "lucide-react";

interface DashboardStats {
  total_patients: number;
  today_appointments: number;
  total_appointments: number;
  scheduled_appointments: number;
  active_conversations: number;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/stats");
      return data;
    },
    refetchInterval: 30_000,
  });

  const statCards = [
    {
      title: "Total Patients",
      value: stats?.total_patients,
      icon: Users,
      description: "Active patient records",
      color: "text-blue-600",
    },
    {
      title: "Scheduled",
      value: stats?.scheduled_appointments,
      icon: ClipboardList,
      description: "Upcoming appointments",
      color: "text-amber-600",
    },
    {
      title: "Today",
      value: stats?.today_appointments,
      icon: CalendarClock,
      description: "Appointments today",
      color: "text-green-600",
    },
    {
      title: "Conversations",
      value: stats?.active_conversations,
      icon: MessageSquare,
      description: "Active AI chats (7 days)",
      color: "text-purple-600",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome to Harmony Health Patient Management System"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    stat.value ?? "—"
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
