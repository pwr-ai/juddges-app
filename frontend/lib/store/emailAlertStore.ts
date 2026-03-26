import { create } from 'zustand';
import type {
  EmailAlertSubscription,
  CreateEmailAlertInput,
  UpdateEmailAlertInput,
  EmailAlertLog,
} from '@/types/email-alert';
import logger from '@/lib/logger';

const storeLogger = logger.child('emailAlertStore');

interface EmailAlertState {
  alerts: EmailAlertSubscription[];
  logs: EmailAlertLog[];
  isLoading: boolean;
  isLoadingLogs: boolean;
  error: string | null;

  // Actions
  fetchAlerts: (type?: string) => Promise<void>;
  createAlert: (input: CreateEmailAlertInput) => Promise<EmailAlertSubscription | null>;
  updateAlert: (id: string, input: UpdateEmailAlertInput) => Promise<EmailAlertSubscription | null>;
  deleteAlert: (id: string) => Promise<boolean>;
  toggleAlert: (id: string, isActive: boolean) => Promise<void>;
  fetchLogs: (subscriptionId?: string) => Promise<void>;
}

export const useEmailAlertStore = create<EmailAlertState>()((set, get) => ({
  alerts: [],
  logs: [],
  isLoading: false,
  isLoadingLogs: false,
  error: null,

  fetchAlerts: async (type?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      const url = `/api/email-alerts${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch email alerts');
      }

      const alerts: EmailAlertSubscription[] = await response.json();
      set({ alerts, isLoading: false });
    } catch (error) {
      storeLogger.error('Failed to fetch email alerts', error);
      set({ error: 'Failed to load email alerts', isLoading: false });
    }
  },

  createAlert: async (input: CreateEmailAlertInput) => {
    try {
      const response = await fetch('/api/email-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error('Failed to create email alert');
      }

      const alert: EmailAlertSubscription = await response.json();

      set((state) => ({
        alerts: [alert, ...state.alerts],
      }));

      return alert;
    } catch (error) {
      storeLogger.error('Failed to create email alert', error);
      set({ error: 'Failed to create email alert' });
      return null;
    }
  },

  updateAlert: async (id: string, input: UpdateEmailAlertInput) => {
    try {
      const response = await fetch('/api/email-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...input }),
      });

      if (!response.ok) {
        throw new Error('Failed to update email alert');
      }

      const updatedAlert: EmailAlertSubscription = await response.json();

      set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? updatedAlert : a),
      }));

      return updatedAlert;
    } catch (error) {
      storeLogger.error('Failed to update email alert', error);
      set({ error: 'Failed to update email alert' });
      return null;
    }
  },

  deleteAlert: async (id: string) => {
    try {
      const response = await fetch(`/api/email-alerts?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete email alert');
      }

      set((state) => ({
        alerts: state.alerts.filter(a => a.id !== id),
      }));

      return true;
    } catch (error) {
      storeLogger.error('Failed to delete email alert', error);
      set({ error: 'Failed to delete email alert' });
      return false;
    }
  },

  toggleAlert: async (id: string, isActive: boolean) => {
    // Optimistic update
    set((state) => ({
      alerts: state.alerts.map(a =>
        a.id === id ? { ...a, is_active: isActive } : a
      ),
    }));

    try {
      await fetch('/api/email-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: isActive }),
      });
    } catch (error) {
      // Revert on failure
      set((state) => ({
        alerts: state.alerts.map(a =>
          a.id === id ? { ...a, is_active: !isActive } : a
        ),
      }));
      storeLogger.error('Failed to toggle email alert', error);
    }
  },

  fetchLogs: async (subscriptionId?: string) => {
    set({ isLoadingLogs: true });
    try {
      const params = new URLSearchParams();
      if (subscriptionId) params.set('subscription_id', subscriptionId);
      const url = `/api/email-alerts/log${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch alert logs');
      }

      const logs: EmailAlertLog[] = await response.json();
      set({ logs, isLoadingLogs: false });
    } catch (error) {
      storeLogger.error('Failed to fetch alert logs', error);
      set({ isLoadingLogs: false });
    }
  },
}));
