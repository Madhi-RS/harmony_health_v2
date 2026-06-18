"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Users, CalendarClock, MessageSquare, Activity } from "lucide-react";

const stats = [
  {
    title: "Total Patients",
    value: "—",
    icon: Users,
    description: "Registered patients",
  },
  {
    title: "Today's Appointments",
    value: "—",
    icon: CalendarClock,
    description: "Scheduled for today",
  },
  {
    title: "Active Conversations",
    value: "—",
    icon: MessageSquare,
    description: "AI Receptionist chats",
  },
  {
    title: "Recent Activity",
    value: "—",
    icon: Activity,
    description: "Actions in last 24h",
  },
];

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome to Harmony Health Patient Management System"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
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
