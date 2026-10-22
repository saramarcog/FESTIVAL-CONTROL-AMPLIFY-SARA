const express = require('express');
const router = express.Router();
const { dynamoOps } = require('../dynamoClient');

const VALID_STAGES = ['MAIN STAGE', 'GARDEN', 'WAREHOUSE', 'RIVER STAGE'];
const VALID_STATUSES = ['CONFIRMED', 'DELAYED', 'CANCELLED'];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/events - Obtener lista de eventos desde DynamoDB
router.get('/', async (req, res) => {
  try {
    const { search, space } = req.query;
    const events = await dynamoOps.getAllEvents(search, space);
    res.json(events);
  } catch (error) {
    console.error('[API Error] Error al listar eventos:', error);
    res.status(500).json({ error: 'Error al consultar eventos en DynamoDB' });
  }
});

// GET /api/events/status/info - Obtener estado de la conexión a DynamoDB
router.get('/status/info', (req, res) => {
  res.json(dynamoOps.getStatus());
});

// GET /api/events/:id - Obtener un evento por su ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const event = await dynamoOps.getEventById(id);
    if (!event) {
      return res.status(404).json({ error: `Evento con ID ${id} no encontrado en DynamoDB` });
    }
    res.json(event);
  } catch (error) {
    console.error('[API Error] Error al consultar evento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/events - Crear un nuevo evento en DynamoDB
router.post('/', async (req, res) => {
  try {
    const { artist, space, time, status = 'CONFIRMED' } = req.body;

    // Validaciones
    if (!artist || typeof artist !== 'string' || artist.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre del artista es obligatorio' });
    }

    if (!space || !VALID_STAGES.includes(space)) {
      return res.status(400).json({ 
        error: `Escenario no válido. Debe ser uno de: ${VALID_STAGES.join(', ')}` 
      });
    }

    if (!time || !TIME_REGEX.test(time)) {
      return res.status(400).json({ error: 'La hora debe tener formato válido HH:MM (24 horas, ej. 21:45)' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        error: `Estado no válido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` 
      });
    }

    const newEvent = await dynamoOps.createEvent({
      artist: artist.trim(),
      space,
      time,
      status
    });

    console.log(`[API] Evento creado en DynamoDB: ${newEvent.id} - ${newEvent.artist}`);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('[API Error] Error al crear evento:', error);
    res.status(500).json({ error: 'Error al persistir el evento en DynamoDB' });
  }
});

// PUT /api/events/:id - Modificar un evento en DynamoDB
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { artist, space, time, status } = req.body;

    const existing = await dynamoOps.getEventById(id);
    if (!existing) {
      return res.status(404).json({ error: `Evento ${id} no existe en DynamoDB` });
    }

    if (artist !== undefined && (typeof artist !== 'string' || artist.trim().length === 0)) {
      return res.status(400).json({ error: 'El nombre del artista no puede estar vacío' });
    }

    if (space !== undefined && !VALID_STAGES.includes(space)) {
      return res.status(400).json({ 
        error: `Escenario no válido. Debe ser uno de: ${VALID_STAGES.join(', ')}` 
      });
    }

    if (time !== undefined && !TIME_REGEX.test(time)) {
      return res.status(400).json({ error: 'La hora debe tener formato válido HH:MM (ej. 21:45)' });
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        error: `Estado no válido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` 
      });
    }

    const updated = await dynamoOps.updateEvent(id, { artist, space, time, status });
    console.log(`[API] Evento actualizado en DynamoDB: ${id}`);
    res.json(updated);
  } catch (error) {
    console.error('[API Error] Error al actualizar evento:', error);
    res.status(500).json({ error: 'Error al actualizar el evento en DynamoDB' });
  }
});

// PATCH /api/events/:id/status - Cambiar o ciclar el estado de un evento
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const existing = await dynamoOps.getEventById(id);
    if (!existing) {
      return res.status(404).json({ error: `Evento ${id} no existe en DynamoDB` });
    }

    let updated;
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Estado no válido: ${status}` });
      }
      updated = await dynamoOps.updateEvent(id, { status });
    } else {
      updated = await dynamoOps.toggleEventStatus(id);
    }

    console.log(`[API] Estado actualizado en DynamoDB para ${id}: ${updated.status}`);
    res.json(updated);
  } catch (error) {
    console.error('[API Error] Error al cambiar estado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// DELETE /api/events/:id - Eliminar un evento en DynamoDB
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await dynamoOps.deleteEvent(id);
    if (!deleted) {
      return res.status(404).json({ error: `Evento ${id} no encontrado en DynamoDB` });
    }

    console.log(`[API] Evento eliminado en DynamoDB: ${id}`);
    res.json({ message: 'Evento eliminado correctamente de DynamoDB', id });
  } catch (error) {
    console.error('[API Error] Error al eliminar evento:', error);
    res.status(500).json({ error: 'Error al eliminar el evento en DynamoDB' });
  }
});

module.exports = router;
