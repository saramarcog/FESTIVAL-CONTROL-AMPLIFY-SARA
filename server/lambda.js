const serverless = require('serverless-http');
const app = require('./app');

// Handler Serverless para AWS Lambda integrado con Amazon API Gateway
// y conectado con Amazon DynamoDB
module.exports.handler = serverless(app);

