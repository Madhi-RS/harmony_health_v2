"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useAppointment,
  useUpdateAppointment,
  useDeleteAppointment,
  useUpdateAppointmentStatus,
} from "@/hooks/use-appointments";
import type {
  AppointmentUpdate,
  AppointmentStatus,
} from "@/types/appointment";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AppointmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: appointment, isLoading, isError, error, refetch } =
    useAppointment(id);
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();
  const statusMutation = useUpdateAppointmentStatus();

  const handleUpdate = (data: AppointmentUpdate) => {
    updateMutation.mutate(
      { id, data },
      { onSuccess: () => setEditOpen(false) }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(id, {
      onSuccess: () => router.push("/appointments"),
    });
  };

  const handleStatusChange = (status: AppointmentStatus) => {
    statusMutation.mutate({ id, data: { status } });
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/appointments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Appointments
        </Link>
      </div>

      <AppointmentDetail
        appointment={appointment}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onStatusChange={handleStatusChange}
        isUpdatingStatus={statusMutation.isPending}
        refetch={refetch}
      />

      <AppointmentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        appointment={appointment}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Appointment"
        description="Are you sure you want to delete this appointment? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
