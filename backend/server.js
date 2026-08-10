const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// CORS simple y efectivo
app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// Conexión a la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
  if (err) console.error('❌ Error conectando a la base de datos:', err.message);
  else console.log('✅ Conectado exitosamente a la base de datos');
});

app.get('/api/health', (req, res) => res.json({ status: '✅ Servidor CRM funcionando' }));

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const authorizeRole = (rol) => (req, res, next) => {
  if (req.user.rol !== rol) return res.status(403).json({ error: 'Acceso denegado' });
  next();
};

// --- LOGIN Y REGISTRO ---
app.post('/api/login', async (req, res) => {
  const { correo_electronico, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = result.rows[0];
    let valid = false;
    if (user.password_hash?.startsWith('$2b')) valid = await bcrypt.compare(password, user.password_hash);
    else valid = (password === user.password_hash);

    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign({ id: user.id, nombre: user.nombre, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/api/register', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { nombre, correo_electronico, telefono, password, rol } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, correo_electronico, telefono, password_hash, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, correo_electronico, telefono, rol',
      [nombre, correo_electronico, telefono, hash, rol || 'vendedor']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});
// Ruta para obtener la lista de usuarios (¡La que faltaba!)
app.get('/api/usuarios', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, correo_electronico, telefono, rol FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err.message);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
  }
});
// --- CRUD DE CLIENTES ---
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const query = req.user.rol === 'vendedor'
      ? 'SELECT * FROM clientes WHERE asesor_id = $1 ORDER BY id DESC'
      : 'SELECT * FROM clientes ORDER BY id DESC';
    const params = req.user.rol === 'vendedor' ? [req.user.id] : [];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  const { nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO clientes (nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, asesor_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre, telefono, fecha_ingreso || new Date(), presupuesto || 0, metodo_pago, propiedad_interesado, necesidades, observaciones, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
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
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Backend corriendo en el puerto ${PORT}`)); Casi que no después cinco dras, no paso acerca, clientes, me staras aquí a carros Karen Vegas del usuario.