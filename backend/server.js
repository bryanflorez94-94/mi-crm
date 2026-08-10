const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
// Configuración CORS definitiva para Railway y Vercel
const corsOptions = {
  // Permitir solo estos orígenes (tu página de Vercel y tu localhost de pruebas)
  origin: ['https://mi-crm-ten.vercel.app', 'http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Para navegadores antiguos o proxies
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Esta línea fuerza a responder a las peticiones de "prueba" del navegador
// Configuración de CORS (Permite todo para evitar bloqueos en Railway)
app.use(cors());
app.options('*', cors());
app.use(express.json());

// Conexión a la base de datos (Render o Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err) => {
  if (err) console.error('❌ Error conectando a la base de datos:', err.message);
  else console.log('✅ Conectado exitosamente a la base de datos');
});

// --- RUTA DE DIAGNÓSTICO (La que estamos probando) ---
app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Servidor CRM funcionando correctamente' });
});

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const authorizeRole = (rolPermitido) => {
  return (req, res, next) => {
    if (req.user.rol !== rolPermitido) return res.status(403).json({ error: 'Acceso denegado' });
    next();
  };
};

// --- RUTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
  const { correo_electronico, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = result.rows[0];
    
    // Comparador de contraseñas (acepta tanto texto plano como encriptado)
    let validPassword = false;
    if (user.password_hash && user.password_hash.startsWith('$2b')) {
      validPassword = await bcrypt.compare(password, user.password_hash);
    } else {
      validPassword = (password === user.password_hash);
    }
    
    if (!validPassword) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, rol: user.rol }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// --- RUTAS DE CLIENTES ---
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM clientes ORDER BY id DESC';
    if (req.user.rol === 'vendedor') {
      query = 'SELECT * FROM clientes WHERE asesor_id = $1 ORDER BY id DESC';
      const result = await pool.query(query, [req.user.id]);
      return res.json(result.rows);
    } else {
      const result = await pool.query(query);
      return res.json(result.rows);
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  const { nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones } = req.body;
  const asesor_id = req.user.id;
  try {
    const result = await pool.query(
      `INSERT INTO clientes (nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, asesor_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre, telefono, fecha_ingreso || new Date(), presupuesto || 0, metodo_pago, propiedad_interesado, necesidades, observaciones, asesor_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al insertar cliente:', err.message);
    res.status(500).json({ error: 'Error al crear el cliente' });
  }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clientes SET nombre=$1, telefono=$2, fecha_ingreso=$3, presupuesto=$4, metodo_pago=$5, propiedad_interesado=$6, necesidades=$7, observaciones=$8 WHERE id=$9 RETURNING *`,
      [nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar cliente:', err.message);
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    console.error('Error al eliminar cliente:', err.message);
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

// --- PUERTO DINÁMICO PARA RAILWAY ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend corriendo en el puerto ${PORT} y escuchando en 0.0.0.0`);
});