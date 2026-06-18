"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentService } from "@/services/appointments";
import type {
  AppointmentCreate,
  AppointmentUpdate,
  AppointmentFilters,
  AppointmentStatusUpdate,
} from "@/types/appointment";
import { toast } from "sonner";

export function useAppointments(params?: AppointmentFilters) {
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentService.list(params),
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ["appointments", id],
    queryFn: () => appointmentService.get(id),
    enabled: !!id,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AppointmentCreate | AppointmentUpdate) => appointmentService.create(data as AppointmentCreate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment created successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.detail || "Failed to create appointment"
      );
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AppointmentUpdate }) =>
      appointmentService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment updated successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.detail || "Failed to update appointment"
      );
    },
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: AppointmentStatusUpdate;
    }) => appointmentService.updateStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment status updated");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.detail || "Failed to update status"
      );
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => appointmentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment deleted successfully");
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.detail || "Failed to delete appointment"
      );
    },
  });
}
