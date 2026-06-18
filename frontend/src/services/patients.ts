import api from "@/lib/axios";
import type {
  Patient,
  PatientCreate,
  PatientUpdate,
  PatientListResponse,
} from "@/types/patient";

export const patientService = {
  async list(params?: {
    query?: string;
    page?: number;
    size?: number;
  }): Promise<PatientListResponse> {
    const response = await api.get<PatientListResponse>("/patients", { params });
    return response.data;
  },

  async get(id: string): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  async create(data: PatientCreate): Promise<Patient> {
    const response = await api.post<Patient>("/patients", data);
    return response.data;
  },

  async update(id: string, data: PatientUpdate): Promise<Patient> {
    const response = await api.put<Patient>(`/patients/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/patients/${id}`);
  },
};
