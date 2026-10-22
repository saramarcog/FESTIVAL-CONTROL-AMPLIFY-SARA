require('dotenv').config();
const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand 
} = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'FestivalEvents';

// Configuración del cliente DynamoDB
const clientConfig = {
  region: REGION,
};

// Soporte para endpoint personalizado (ej: DynamoDB Local http://localhost:8000 o LocalStack)
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

// Credenciales explícitas (útil para AWS Academy / .env)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
  };
}

const rawClient = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

let isConnectedToAws = false;
let tableChecked = false;

// Semilla inicial
const INITIAL_EVENTS = [
  { id: 'EVT-101', artist: 'NEON WAVES', space: 'MAIN STAGE', time: '22:30', status: 'CONFIRMED' },
  { id: 'EVT-102', artist: 'MIDNIGHT SESSION', space: 'GARDEN', time: '23:15', status: 'DELAYED' },
  { id: 'EVT-103', artist: 'ELECTRIC SUNSET', space: 'MAIN STAGE', time: '20:15', status: 'CONFIRMED' },
  { id: 'EVT-104', artist: 'BASS THEORY', space: 'WAREHOUSE', time: '00:30', status: 'CONFIRMED' }
];

// Almacén persistente local de respaldo si no hay conexión activa a AWS
const fs = require('fs');
const path = require('path');
const fallbackDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
const fallbackFile = path.join(fallbackDir, 'dynamodb_local_cache.json');

function loadFallbackData() {
  try {
    if (fs.existsSync(fallbackFile)) {
      return JSON.parse(fs.readFileSync(fallbackFile, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Cache] Error al leer caché local:', err.message);
  }
  return [...INITIAL_EVENTS];
}

function saveFallbackData(data) {
  try {
    fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Cache] Error al guardar caché local:', err.message);
  }
}

let localMemoryEvents = loadFallbackData();

// Inicialización de tabla DynamoDB
async function ensureTableExists() {
  if (tableChecked) return isConnectedToAws;
  try {
    console.log(`[DynamoDB] Verificando tabla "${TABLE_NAME}" en región "${REGION}"...`);
    await rawClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`[DynamoDB] ✅ Tabla "${TABLE_NAME}" encontrada y lista para operar.`);
    isConnectedToAws = true;
    tableChecked = true;

    // Verificar si está vacía para insertar la semilla inicial
    const scan = await docClient.send(new ScanCommand({ TableName: TABLE_NAME, Limit: 1 }));
    if (!scan.Items || scan.Items.length === 0) {
      console.log('[DynamoDB] Tabla vacía. Insertando eventos iniciales del festival...');
      for (const ev of INITIAL_EVENTS) {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...ev,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }));
      }
      console.log(`[DynamoDB] ✅ ${INITIAL_EVENTS.length} eventos iniciales insertados.`);
    }
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`[DynamoDB] La tabla "${TABLE_NAME}" no existe. Creándola automáticamente...`);
      try {
        await rawClient.send(new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST'
        }));
        console.log(`[DynamoDB] ✅ Creación de tabla "${TABLE_NAME}" solicitada con éxito.`);
        isConnectedToAws = true;
        tableChecked = true;
        return true;
      } catch (createErr) {
        console.error('[DynamoDB] Error al crear la tabla en AWS:', createErr.message);
      }
    } else {
      console.warn(`[DynamoDB] ⚠️ Conexión remota no disponible (${error.name || error.message}).`);
      console.warn(`[DynamoDB] 👉 Activando modo de persistencia local sincronizada para garantizar funcionamiento ininterrumpido.`);
    }
    isConnectedToAws = false;
    tableChecked = true;
    return false;
  }
}

// Operaciones DynamoDB con fallback automático
const dynamoOps = {
  getStatus: () => ({
    connectedToAws: isConnectedToAws,
    tableName: TABLE_NAME,
    region: REGION,
    storageType: isConnectedToAws ? 'AWS DynamoDB (Cloud)' : 'DynamoDB Persistencia Local'
  }),

  getAllEvents: async (search = '', space = '') => {
    await ensureTableExists();
    let events = [];

    if (isConnectedToAws) {
      try {
        const result = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        events = result.Items || [];
      } catch (err) {
        console.error('[DynamoDB Scan Error]:', err.message);
        events = localMemoryEvents;
      }
    } else {
      events = localMemoryEvents;
    }

    // Filtrado en memoria (compatible con DynamoDB Scan Filter)
    return events.filter(e => {
      const matchSpace = !space || space === 'TODOS' || e.space === space;
      const matchSearch = !search || 
        (e.artist && e.artist.toLowerCase().includes(search.toLowerCase())) ||
        (e.id && e.id.toLowerCase().includes(search.toLowerCase()));
      return matchSpace && matchSearch;
    });
  },

  getEventById: async (id) => {
    await ensureTableExists();
    if (isConnectedToAws) {
      try {
        const result = await docClient.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { id }
        }));
        return result.Item || null;
      } catch (err) {
        console.error('[DynamoDB Get Error]:', err.message);
      }
    }
    return localMemoryEvents.find(e => e.id === id) || null;
  },

  createEvent: async ({ id, artist, space, time, status }) => {
    await ensureTableExists();
    const eventId = id || `EVT-${Date.now().toString().slice(-7)}`;
    const now = new Date().toISOString();
    const item = {
      id: eventId,
      artist: artist.toUpperCase().trim(),
      space,
      time,
      status,
      createdAt: now,
      updatedAt: now
    };

    if (isConnectedToAws) {
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: item
        }));
        console.log(`[DynamoDB] Item guardado en AWS: ${eventId}`);
      } catch (err) {
        console.error('[DynamoDB Put Error]:', err.message);
      }
    }

    // Mantener siempre sincronizado en persistencia local
    localMemoryEvents = [item, ...localMemoryEvents.filter(e => e.id !== eventId)];
    saveFallbackData(localMemoryEvents);

    return item;
  },

  updateEvent: async (id, { artist, space, time, status }) => {
    await ensureTableExists();
    const existing = await dynamoOps.getEventById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      artist: artist !== undefined ? artist.toUpperCase().trim() : existing.artist,
      space: space !== undefined ? space : existing.space,
      time: time !== undefined ? time : existing.time,
      status: status !== undefined ? status : existing.status,
      updatedAt: now
    };

    if (isConnectedToAws) {
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: updated
        }));
        console.log(`[DynamoDB] Item actualizado en AWS: ${id}`);
      } catch (err) {
        console.error('[DynamoDB Update Error]:', err.message);
      }
    }

    localMemoryEvents = localMemoryEvents.map(e => e.id === id ? updated : e);
    saveFallbackData(localMemoryEvents);
    return updated;
  },

  toggleEventStatus: async (id) => {
    const existing = await dynamoOps.getEventById(id);
    if (!existing) return null;

    const nextStatus = 
      existing.status === 'CONFIRMED' ? 'DELAYED' :
      existing.status === 'DELAYED' ? 'CANCELLED' : 'CONFIRMED';

    return dynamoOps.updateEvent(id, { status: nextStatus });
  },

  deleteEvent: async (id) => {
    await ensureTableExists();
    const existing = await dynamoOps.getEventById(id);
    if (!existing) return false;

    if (isConnectedToAws) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id }
        }));
        console.log(`[DynamoDB] Item eliminado en AWS: ${id}`);
      } catch (err) {
        console.error('[DynamoDB Delete Error]:', err.message);
      }
    }

    localMemoryEvents = localMemoryEvents.filter(e => e.id !== id);
    saveFallbackData(localMemoryEvents);
    return true;
  }
};

module.exports = {
  rawClient,
  docClient,
  ensureTableExists,
  dynamoOps,
  TABLE_NAME,
  REGION
};

