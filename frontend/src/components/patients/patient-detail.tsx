"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { format } from "date-fns";
import { Pencil, Trash2, CalendarClock } from "lucide-react";
import type { Patient } from "@/types/patient";

interface PatientDetailProps {
  patient: Patient | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onEdit: () => void;
  onDelete: () => void;
  refetch: () => void;
}

export function PatientDetail({
  patient,
  isLoading,
  isError,
  error,
  onEdit,
  onDelete,
  refetch,
}: PatientDetailProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message || "Failed to load patient"}
        retry={refetch}
      />
    );
  }

  if (!patient) {
    return <ErrorState message="Patient not found" />;
  }

  const infoCards = [
    {
      title: "Personal Information",
      items: [
        { label: "Full Name", value: `${patient.first_name} ${patient.last_name}` },
        {
          label: "Date of Birth",
          value: patient.date_of_birth
            ? format(new Date(patient.date_of_birth), "MMMM d, yyyy")
            : "—",
        },
        { label: "Gender", value: patient.gender || "—" },
      ],
    },
    {
      title: "Contact Information",
      items: [
        { label: "Phone", value: patient.phone || "—" },
        { label: "Email", value: patient.email || "—" },
        { label: "Address", value: patient.address || "—" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {patient.first_name} {patient.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Patient ID: {patient.id.slice(0, 8)}...
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
        {infoCards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {card.items.map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Medical History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Medical History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {patient.medical_history || "No medical history recorded."}
          </p>
        </CardContent>
      </Card>

      {/* Record info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Created:{" "}
          {format(new Date(patient.created_at), "MMM d, yyyy h:mm a")}
        </p>
        <p>
          Last Updated:{" "}
          {format(new Date(patient.updated_at), "MMM d, yyyy h:mm a")}
        </p>
      </div>
    </div>
  );
}
