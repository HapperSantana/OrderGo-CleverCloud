const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const clientRoutes = require('./routes/clientRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const frontendPath = path.resolve(__dirname, '../../frontend');
// Dependencias de interfaz auto-hospedadas (compatibles con la CSP 'self' de Helmet).
const packageDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const vendorAssets = {
  '/vendor/bootstrap': path.join(packageDir('bootstrap'), 'dist'),
  '/vendor/bootstrap-icons': path.join(packageDir('bootstrap-icons'), 'font'),
  '/vendor/inter': packageDir('@fontsource-variable/inter')
};
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Permite herramientas sin Origin (curl/Postman) y el origen del frontend configurado.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por la politica CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.get('/api/health', (req, res) => {
  res.json({ estado: 'ok', servicio: 'OrderGo API', fecha: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/clientes', clientRoutes);
app.use('/api/productos', productRoutes);
app.use('/api/pedidos', orderRoutes);

app.use('/api', notFound);
for (const [route, dir] of Object.entries(vendorAssets)) {
  app.use(route, express.static(dir, { index: false, maxAge: '7d' }));
}
app.use(express.static(frontendPath, { index: false, extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'login.html')));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
