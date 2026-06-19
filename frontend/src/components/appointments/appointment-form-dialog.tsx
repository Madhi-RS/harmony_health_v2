"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { usePatients } from "@/hooks/use-patients";
import type { Appointment, AppointmentCreate, AppointmentUpdate } from "@/types/appointment";

interface AppointmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  patientId?: string;
  onSubmit: (data: AppointmentCreate | AppointmentUpdate) => void;
  isSubmitting: boolean;
}

export function AppointmentFormDialog({
  open, onOpenChange, appointment, patientId, onSubmit, isSubmitting,
}: AppointmentFormDialogProps) {
  const isEdit = !!appointment;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || "");

  // Fetch patients for the dropdown
  const { data: patientsData } = usePatients({ size: 100 });

  useEffect(() => {
    if (appointment) {
      setTitle(appointment.title);
      setDescription(appointment.description || "");
      const d = new Date(appointment.appointment_date);
      setAppointmentDate(d.toISOString().split("T")[0]);
      setAppointmentTime(d.toTimeString().slice(0, 5));
      setSelectedPatientId(appointment.patient_id || "");
    } else {
      setTitle(""); setDescription(""); setAppointmentDate(""); setAppointmentTime("");
      setSelectedPatientId(patientId || "");
    }
  }, [appointment, open, patientId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = appointmentDate
      ? `${appointmentDate}T${appointmentTime || "09:00"}:00`
      : new Date().toISOString();
    if (isEdit) {
      onSubmit({ title, description: description || null, appointment_date: dateStr } as AppointmentUpdate);
    } else {
      onSubmit({
        title,
        description: description || null,
        appointment_date: dateStr,
        patient_id: selectedPatientId,
      } as AppointmentCreate);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] sm:max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{isEdit ? "Edit Appointment" : "New Appointment"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the appointment details." : "Schedule a new appointment."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-2 flex-1">
          <form id="appointment-form" onSubmit={handleSubmit} className="space-y-4">
            {!isEdit && (
              <div className="space-y-2">
                <Label htmlFor="patient-select">Patient *</Label>
                <Select value={selectedPatientId} onValueChange={(v) => v && setSelectedPatientId(v)} disabled={isSubmitting}>
                  <SelectTrigger id="patient-select">
                    <SelectValue placeholder="Select a patient..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {patientsData?.items.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.last_name}, {p.first_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {patientsData && patientsData.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">No patients yet. Create a patient first.</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isSubmitting} placeholder="e.g. Annual Checkup" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea id="description" className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appointment-date">Date *</Label>
                <Input id="appointment-date" type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointment-time">Time</Label>
                <Input id="appointment-time" type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} disabled={isSubmitting} />
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6 pt-2 border-t shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="appointment-form" disabled={isSubmitting || (!isEdit && !selectedPatientId)}>
            {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : isEdit ? "Update" : "Create Appointment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
