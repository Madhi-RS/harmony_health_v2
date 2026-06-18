"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PatientDetail } from "@/components/patients/patient-detail";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { usePatient, useUpdatePatient, useDeletePatient } from "@/hooks/use-patients";
import type { PatientUpdate } from "@/types/patient";
import Link from "next/link";

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: patient, isLoading, isError, error, refetch } = usePatient(id);
  const updateMutation = useUpdatePatient();
  const deleteMutation = useDeletePatient();

  const handleUpdate = (data: PatientUpdate) => {
    updateMutation.mutate(
      { id, data },
      { onSuccess: () => setEditOpen(false) }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(id, {
      onSuccess: () => router.push("/patients"),
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/patients"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Patients
        </Link>
      </div>

      <PatientDetail
        patient={patient}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        refetch={refetch}
      />

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Patient"
        description="Are you sure you want to delete this patient? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
