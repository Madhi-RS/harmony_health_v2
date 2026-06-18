"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import type { Appointment } from "@/types/appointment";
import type { AppointmentStatus } from "@/types/appointment";
import { APPOINTMENT_STATUS_OPTIONS } from "./appointment-status-badge";

interface AppointmentDetailProps {
  appointment: Appointment | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
  isUpdatingStatus: boolean;
  refetch: () => void;
}

export function AppointmentDetail({
  appointment,
  isLoading,
  isError,
  error,
  onEdit,
  onDelete,
  onStatusChange,
  isUpdatingStatus,
  refetch,
}: AppointmentDetailProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message || "Failed to load appointment"}
        retry={refetch}
      />
    );
  }

  if (!appointment) {
    return <ErrorState message="Appointment not found" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{appointment.title}</h1>
            <AppointmentStatusBadge status={appointment.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            ID: {appointment.id.slice(0, 8)}...
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Appointment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Date & Time</p>
              <p className="text-sm font-medium">
                {format(
                  new Date(appointment.appointment_date),
                  "EEEE, MMMM d, yyyy 'at' h:mm a"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="flex items-center gap-2 mt-1">
                <AppointmentStatusBadge status={appointment.status} />
                <Select
                  value={appointment.status}
                  onValueChange={(v) =>
                    onStatusChange(v as AppointmentStatus)
                  }
                  disabled={isUpdatingStatus}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Additional Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm">
                {appointment.description || "No description provided."}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">
                {appointment.notes || "No notes."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timestamps */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Created:{" "}
          {format(new Date(appointment.created_at), "MMM d, yyyy h:mm a")}
        </p>
        <p>
          Last Updated:{" "}
          {format(new Date(appointment.updated_at), "MMM d, yyyy h:mm a")}
        </p>
      </div>
    </div>
  );
}
