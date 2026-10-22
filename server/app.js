const express = require('express');
const cors = require('cors');
const eventsRouter = require('./routes/events');
const { dynamoOps } = require('./dynamoClient');

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // Permitir llamadas desde cualquier origen (Expo Web local y dominios de AWS Amplify)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Logger de peticiones HTTP
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Endpoint de comprobación de salud (Health Check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Festival Control API (Serverless AWS Lambda)',
    database: 'Amazon DynamoDB',
    dynamoStatus: dynamoOps.getStatus(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Rutas de eventos
app.use('/api/events', eventsRouter);

// Manejo de rutas inexistentes (404)
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Manejador global de errores (500)
app.use((err, req, res, next) => {
  console.error('[Error No Controlado]:', err);
  res.status(500).json({ error: 'Error interno del servidor backend' });
});

module.exports = app;

