"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth-store";
import type { LoginCredentials, RegisterData } from "@/types/auth";

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const setError = useAuthStore((s) => s.setError);

  return useMutation({
    mutationFn: (data: LoginCredentials) => authService.login(data),
    onSuccess: (response) => {
      login(response.user, {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        token_type: response.token_type,
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.detail || "Login failed. Please try again.";
      setError(message);
    },
  });
}

export function useRegister() {
  const login = useAuthStore((s) => s.login);
  const setError = useAuthStore((s) => s.setError);

  return useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onSuccess: (response) => {
      login(response.user, {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        token_type: response.token_type,
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.detail ||
        "Registration failed. Please try again.";
      setError(message);
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    logout();
    queryClient.clear();
    router.push("/login");
  };
}

export function useCurrentUser() {
  const token = useAuthStore((s) => s.tokens?.access_token);
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const user = await authService.getMe();
      setUser(user);
      return user;
    },
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const tokens = useAuthStore((s) => s.tokens);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  return {
    isAuthenticated,
    user,
    tokens,
    isLoading,
    error,
  };
}
