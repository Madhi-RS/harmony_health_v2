"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PatientSearchBar } from "@/components/patients/patient-search-bar";
import { PatientTable } from "@/components/patients/patient-table";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
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
  usePatients,
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
} from "@/hooks/use-patients";
import type { Patient, PatientCreate, PatientUpdate } from "@/types/patient";

export default function PatientsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const size = 10;

  const { data, isLoading, isError, error, refetch } = usePatients({
    query: query || undefined,
    page,
    size,
  });

  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient();
  const deleteMutation = useDeletePatient();

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  }, []);

  const handleCreate = (data: PatientCreate | PatientUpdate) => {
    createMutation.mutate(data, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  const handleEdit = (patient: Patient) => {
    setEditPatient(patient);
  };

  const handleUpdate = (data: PatientUpdate) => {
    if (!editPatient) return;
    updateMutation.mutate(
      { id: editPatient.id, data },
      { onSuccess: () => setEditPatient(null) }
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
        title="Patients"
        description="Manage patient records"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Patient
          </Button>
        }
      />

      <div className="mb-4">
        <PatientSearchBar value={query} onChange={handleSearch} />
      </div>

      <PatientTable
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onEdit={(id) => {
          const patient = data?.items.find((p) => p.id === id);
          if (patient) handleEdit(patient);
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    onClick={() => setPage(p)}
                    isActive={page === p}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  className={
                    page >= totalPages ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Create dialog */}
      <PatientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      {/* Edit dialog */}
      <PatientFormDialog
        open={!!editPatient}
        onOpenChange={() => setEditPatient(null)}
        patient={editPatient}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Patient"
        description="Are you sure you want to delete this patient? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
