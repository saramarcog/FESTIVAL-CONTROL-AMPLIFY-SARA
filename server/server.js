require('dotenv').config();
const app = require('./app');
const { dynamoOps, TABLE_NAME, REGION } = require('./dynamoClient');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const status = dynamoOps.getStatus();
  console.log('================================================================');
  console.log(` 🚀 FESTIVAL CONTROL BACKEND INICIADO (MODO LOCAL)`);
  console.log(` 🌐 Servidor:    http://localhost:${PORT}`);
  console.log(` 🩺 Healthcheck: http://localhost:${PORT}/api/health`);
  console.log(` 🎟️  Eventos API: http://localhost:${PORT}/api/events`);
  console.log(` 📦 Base Datos:  Amazon DynamoDB (Tabla: ${TABLE_NAME} | Región: ${REGION})`);
  console.log(` 💾 Modo Almacén: ${status.storageType}`);
  console.log('================================================================');
});
