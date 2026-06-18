"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AppointmentFilters } from "@/components/appointments/appointment-filters";
import { AppointmentTable } from "@/components/appointments/appointment-table";
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Plus } from "lucide-react";
import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointment,
  useDeleteAppointment,
} from "@/hooks/use-appointments";
import type { Appointment, AppointmentCreate, AppointmentUpdate, AppointmentStatus } from "@/types/appointment";

export default function AppointmentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(
    null
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const size = 10;

  const filters = {
    page,
    size,
    ...(status && status !== "all" ? { status: status as any } : {}),
    ...(dateFrom ? { date_from: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo
      ? {
          date_to: new Date(dateTo + "T23:59:59").toISOString(),
        }
      : {}),
  };

  const { data, isLoading, isError, error, refetch } =
    useAppointments(filters);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();

  const handleClear = useCallback(() => {
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }, []);

  const handleCreate = (data: AppointmentCreate | AppointmentUpdate) => {
    createMutation.mutate(data as AppointmentCreate, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  const handleUpdate = (data: AppointmentUpdate) => {
    if (!editAppointment) return;
    updateMutation.mutate(
      { id: editAppointment.id, data },
      { onSuccess: () => setEditAppointment(null) }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => setDeleteId(null),
    });
  };

  const totalPages = data?.pages || 1;

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Manage scheduled appointments"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>
        }
      />

      <div className="mb-4">
        <AppointmentFilters
          status={status}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onStatusChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          onDateFromChange={(v) => {
            setDateFrom(v);
            setPage(1);
          }}
          onDateToChange={(v) => {
            setDateTo(v);
            setPage(1);
          }}
          onClear={handleClear}
        />
      </div>

      <AppointmentTable
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onEdit={(id) => {
          const appt = data?.items.find((a) => a.id === id);
          if (appt) setEditAppointment(appt);
        }}
        onDelete={(id) => setDeleteId(id)}
        refetch={refetch}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      onClick={() => setPage(p)}
                      isActive={page === p}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  className={
                    page >= totalPages
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Create dialog */}
      <AppointmentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      {/* Edit dialog */}
      <AppointmentFormDialog
        open={!!editAppointment}
        onOpenChange={() => setEditAppointment(null)}
        appointment={editAppointment}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Appointment"
        description="Are you sure you want to delete this appointment? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
