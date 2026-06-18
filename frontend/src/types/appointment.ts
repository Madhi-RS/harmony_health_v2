export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface Appointment {
  id: string;
  patient_id: string;
  scheduled_by: string;
  title: string;
  description: string | null;
  appointment_date: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentCreate {
  patient_id: string;
  title: string;
  description?: string | null;
  appointment_date: string;
  notes?: string | null;
}

export interface AppointmentUpdate {
  title?: string;
  description?: string | null;
  appointment_date?: string;
  notes?: string | null;
  patient_id?: string;
}

export interface AppointmentStatusUpdate {
  status: AppointmentStatus;
}

export interface AppointmentListResponse {
  items: Appointment[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface AppointmentFilters {
  page?: number;
  size?: number;
  status?: AppointmentStatus;
  date_from?: string;
  date_to?: string;
  patient_id?: string;
}
