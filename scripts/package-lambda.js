const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Creando paquete optimizado para AWS Lambda...');

const rootDir = path.resolve(__dirname, '..');
const distZip = path.join(rootDir, 'lambda-deployment.zip');
const tempDir = path.join(rootDir, 'dist-lambda');

if (fs.existsSync(distZip)) fs.unlinkSync(distZip);
if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });

fs.mkdirSync(tempDir, { recursive: true });

// Copiar carpeta server
const copyDirRecursive = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'data') copyDirRecursive(srcPath, destPath);
    } else {
      copyDirRecursiveFile(srcPath, destPath);
    }
  }
};

const copyDirRecursiveFile = (src, dest) => {
  fs.copyFileSync(src, dest);
};

copyDirRecursive(path.join(rootDir, 'server'), path.join(tempDir, 'server'));

// Crear un package.json mínimo solo con dependencias de producción de la Lambda
const lambdaPkg = {
  name: "festival-control-backend-lambda",
  version: "1.0.0",
  main: "server/lambda.js",
  dependencies: {
    "cors": "^2.8.6",
    "express": "^5.3.0",
    "serverless-http": "^4.0.0",
    "@aws-sdk/client-dynamodb": "^3.918.0",
    "@aws-sdk/lib-dynamodb": "^3.918.0"
  }
};

fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(lambdaPkg, null, 2));

console.log('Instalando dependencias de producción en dist-lambda...');
execSync('npm.cmd install --omit=dev --no-audit --no-fund', { cwd: tempDir, stdio: 'inherit' });

console.log('Comprimiendo archivo ZIP para AWS Lambda...');
const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${distZip}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

// Limpieza de temporal
fs.rmSync(tempDir, { recursive: true, force: true });

const stats = fs.statSync(distZip);
console.log(`========================================================`);
console.log(`✅ ¡Paquete Lambda generado con éxito!`);
console.log(`📁 Archivo: lambda-deployment.zip (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`🚀 Tamaño ultra ligero: Apto para subida directa en AWS Console`);
console.log(`⚙️  Handler en AWS Lambda: server/lambda.handler`);
console.log(`========================================================`);
