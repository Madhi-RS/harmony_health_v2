import api from "@/lib/axios";
import type {
  Appointment,
  AppointmentCreate,
  AppointmentUpdate,
  AppointmentListResponse,
  AppointmentStatusUpdate,
  AppointmentFilters,
} from "@/types/appointment";

export const appointmentService = {
  async list(params?: AppointmentFilters): Promise<AppointmentListResponse> {
    const response = await api.get<AppointmentListResponse>("/appointments", {
      params,
    });
    return response.data;
  },

  async get(id: string): Promise<Appointment> {
    const response = await api.get<Appointment>(`/appointments/${id}`);
    return response.data;
  },

  async create(data: AppointmentCreate): Promise<Appointment> {
    const response = await api.post<Appointment>("/appointments", data);
    return response.data;
  },

  async update(id: string, data: AppointmentUpdate): Promise<Appointment> {
    const response = await api.put<Appointment>(
      `/appointments/${id}`,
      data
    );
    return response.data;
  },

  async updateStatus(
    id: string,
    data: AppointmentStatusUpdate
  ): Promise<Appointment> {
    const response = await api.patch<Appointment>(
      `/appointments/${id}/status`,
      data
    );
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/appointments/${id}`);
  },
};
