"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { format } from "date-fns";
import { Phone, Clock, DollarSign, BarChart3 } from "lucide-react";

interface CallLog {
  id: string;
  call_id: string;
  duration_seconds: number;
  status: string;
  direction: string;
  created_at: string;
  tenant_id?: string;
  user_id?: string;
}

interface CallsResponse {
  items: CallLog[];
  total: number;
  page: number;
  size: number;
  summary: {
    total_calls: number;
    avg_duration_seconds: number;
    total_cost_usd: number;
  };
}

export default function AnalyticsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<CallsResponse>({
    queryKey: ["analytics-calls"],
    queryFn: async () => {
      const { data } = await api.get("/analytics/calls?size=50");
      return data;
    },
  });

  const summary = data?.summary;
  const calls = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Call logs and AI receptionist analytics (Admin only)"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.total_calls ?? 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {(summary?.avg_duration_seconds ?? 0).toFixed(0)}s
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                ${(summary?.total_cost_usd ?? 0).toFixed(4)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Call Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              message={error?.message || "Failed to load call logs"}
              retry={refetch}
            />
          ) : calls.length === 0 ? (
            <EmptyState
              title="No call logs yet"
              description="Voice calls handled by the AI receptionist will appear here."
              icon={<Phone className="h-10 w-10 text-muted-foreground" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-mono text-xs">
                      {call.call_id?.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant={call.status === "COMPLETED" ? "default" : "secondary"}>
                        {call.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{call.direction || "—"}</TableCell>
                    <TableCell>{(call.duration_seconds ?? 0).toFixed(0)}s</TableCell>
                    <TableCell className="text-xs">
                      {call.created_at
                        ? format(new Date(call.created_at), "MMM d, yyyy h:mm a")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
