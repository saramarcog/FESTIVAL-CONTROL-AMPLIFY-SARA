import { FestivalEvent, EventStatus } from './data';

// URL base de la API backend (configurable por variable de entorno o localhost)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface BackendStatus {
  connected: boolean;
  database: string;
  storageType?: string;
  tableName?: string;
  region?: string;
}

export const api = {
  // Comprobar estado del backend
  async checkHealth(): Promise<BackendStatus> {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        connected: true,
        database: data.database || 'Amazon DynamoDB',
        storageType: data.dynamoStatus?.storageType || 'DynamoDB',
        tableName: data.dynamoStatus?.tableName || 'FestivalEvents',
        region: data.dynamoStatus?.region || 'us-east-1',
      };
    } catch {
      return {
        connected: false,
        database: 'Amazon DynamoDB (Desconectado)',
      };
    }
  },

  // Obtener todos los eventos
  async getEvents(search = '', space = ''): Promise<FestivalEvent[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (space && space !== 'TODOS') params.append('space', space);

    const url = `${API_BASE_URL}/events${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error al obtener eventos (HTTP ${res.status})`);
    }

    return await res.json();
  },

  // Crear un nuevo evento
  async createEvent(event: { artist: string; space: string; time: string; status: EventStatus }): Promise<FestivalEvent> {
    const res = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al persistir el evento en DynamoDB');
    }

    return await res.json();
  },

  // Modificar un evento existente
  async updateEvent(id: string, event: Partial<FestivalEvent>): Promise<FestivalEvent> {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al actualizar evento');
    }

    return await res.json();
  },

  // Alternar el estado (CONFIRMED -> DELAYED -> CANCELLED)
  async toggleStatus(id: string): Promise<FestivalEvent> {
    const res = await fetch(`${API_BASE_URL}/events/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al actualizar estado en DynamoDB');
    }

    return await res.json();
  },

  // Eliminar un evento
  async deleteEvent(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al eliminar evento de DynamoDB');
    }
  },
};

