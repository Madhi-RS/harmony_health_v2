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
import type { PatientListResponse } from "@/types/patient";
import { format } from "date-fns";
import { Eye, Pencil, Trash2 } from "lucide-react";

interface PatientTableProps {
  data: PatientListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  refetch: () => void;
}

export function PatientTable({
  data,
  isLoading,
  isError,
  error,
  onEdit,
  onDelete,
  refetch,
}: PatientTableProps) {
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
        message={error?.message || "Failed to load patients"}
        retry={refetch}
      />
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="No patients found"
        description="Get started by adding your first patient."
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Date of Birth</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((patient) => (
            <TableRow
              key={patient.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/patients/${patient.id}`)}
            >
              <TableCell className="font-medium">
                {patient.last_name}, {patient.first_name}
              </TableCell>
              <TableCell>
                {patient.date_of_birth
                  ? format(new Date(patient.date_of_birth), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              <TableCell>{patient.gender || "—"}</TableCell>
              <TableCell>{patient.phone || "—"}</TableCell>
              <TableCell className="max-w-[200px] truncate">
                {patient.email || "—"}
              </TableCell>
              <TableCell>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/patients/${patient.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(patient.id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(patient.id)}
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
