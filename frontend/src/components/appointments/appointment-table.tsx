"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import type { AppointmentListResponse } from "@/types/appointment";
import { format } from "date-fns";
import { Eye, Pencil, Trash2, CalendarClock } from "lucide-react";

interface AppointmentTableProps {
  data: AppointmentListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  refetch: () => void;
}

export function AppointmentTable({
  data,
  isLoading,
  isError,
  error,
  onEdit,
  onDelete,
  refetch,
}: AppointmentTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message || "Failed to load appointments"}
        retry={refetch}
      />
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="No appointments found"
        description="Schedule your first appointment to get started."
        icon={<CalendarClock className="h-10 w-10 text-muted-foreground" />}
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((appointment) => (
            <TableRow
              key={appointment.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/appointments/${appointment.id}`)}
            >
              <TableCell className="font-medium">
                {appointment.title}
              </TableCell>
              <TableCell>
                {format(new Date(appointment.appointment_date), "MMM d, yyyy h:mm a")}
              </TableCell>
              <TableCell>
                <AppointmentStatusBadge status={appointment.status} />
              </TableCell>
              <TableCell>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      router.push(`/appointments/${appointment.id}`)
                    }
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(appointment.id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(appointment.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
