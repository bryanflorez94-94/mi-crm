const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a Supabase
// CONFIGURACIÓN DEFINITIVA PARA RENDER (Parámetros separados + IPv4 forzado)
// Conexión a la base de datos de Render (EL FINAL DE LA PESADILLA)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render siempre requiere SSL
  }
});
pool.connect((err) => {
  if (err) console.error('❌ Error conectando a Supabase:', err.message);
  else console.log('✅ Conectado exitosamente a Supabase');
});

// --- 1. MIDDLEWARE DE AUTENTICACIÓN (El portero) ---
const authenticateToken = (req, res, next) => {
  // El token debe venir en el encabezado 'Authorization'
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });

  jwt.verify(token, 'TU_SECRETO_SUPER_SEGURO', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.user = user; // Guardamos los datos del usuario (su id y rol) en la petición
    next();
  });
};

// Middleware para verificar roles (Admin o Vendedor)
const authorizeRole = (rolPermitido) => {
  return (req, res, next) => {
    if (req.user.rol !== rolPermitido) {
      return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${rolPermitido}` });
    }
    next();
  };
};

// --- 2. RUTAS DE AUTENTICACIÓN (Login y Registro) ---

// Ruta de Login
app.post('/api/login', async (req, res) => {
  const { correo_electronico, password } = req.body;
  try {
    // Buscar usuario por correo
    const result = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = result.rows[0];

    // (Nota: Por ahora compararemos en texto plano. En el futuro, aquí usarás bcrypt.compare)
    if (password !== user.password_hash) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Generar el Token JWT (firma digital)
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, rol: user.rol }, 
      'TU_SECRETO_SUPER_SEGURO', 
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Ruta para Registrar un nuevo vendedor (¡Solo para ADMIN!)
// Ruta para Registrar un nuevo usuario (¡Solo para ADMIN!)
app.post('/api/register', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { nombre, correo_electronico, telefono, password, rol } = req.body;
  try {
    // Nota: Aquí deberías encriptar la contraseña con bcrypt cuando vayas a producción
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, correo_electronico, telefono, password_hash, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, correo_electronico, telefono, rol',
      [nombre, correo_electronico, telefono, password, rol || 'vendedor']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});
// --- RUTA PÚBLICA PARA MAKE (AUTOMATIZACIÓN) ---
// Esta ruta NO pide login, solo una llave secreta
// --- RUTA PÚBLICA PARA MAKE (VERSIÓN DE PRUEBA EN NAVEGADOR) ---
app.get('/api/public/clientes', async (req, res) => {
  const { 
    nombre, telefono, presupuesto, metodo_pago,
    propiedad_interesado, necesidades, observaciones,
    api_key
  } = req.query; // Nota: Ahora usamos req.query porque GET recibe datos por la URL

  const SECRET_KEY = 'CLAVE_SUPER_SECRETA_PARA_MAKE';

  if (api_key !== SECRET_KEY) {
    return res.json({ error: 'No autorizado. Llave API incorrecta.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clientes 
       (nombre, telefono, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, origen) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [nombre, telefono, presupuesto || 0, metodo_pago, propiedad_interesado, necesidades, observaciones, 'make']
    );
    res.json({ success: true, cliente: result.rows[0] });
  } catch (err) {
    console.error('Error al insertar cliente desde Make:', err.message);
    res.json({ error: 'Error al crear el cliente' });
  }
});
// --- 3. RUTAS DE CLIENTES (AHORA PROTEGIDAS) ---

// Listar clientes (Requiere Login)
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM clientes ORDER BY id DESC';
    // Si es VENDEDOR, solo ve sus propios clientes. Si es ADMIN, ve todos.
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

// Crear cliente (Requiere Login)
app.post('/api/clientes', authenticateToken, async (req, res) => {
  const { 
    nombre, telefono, fecha_ingreso, presupuesto, 
    metodo_pago, propiedad_interesado, necesidades, observaciones 
  } = req.body;

  // Automáticamente asignamos al vendedor que está logueado
  const asesor_id = req.user.id; 

  try {
    const result = await pool.query(
      `INSERT INTO clientes 
       (nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, asesor_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [nombre, telefono, fecha_ingreso || new Date(), presupuesto || 0, metodo_pago, propiedad_interesado, necesidades, observaciones, asesor_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al insertar cliente:', err.message);
    res.status(500).json({ error: 'Error al crear el cliente' });
  }
});
// --- RUTAS DE EDICIÓN Y ELIMINACIÓN (Agrega esto en server.js) ---

// Ruta para ACTUALIZAR un cliente
app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { 
    nombre, telefono, fecha_ingreso, presupuesto, 
    metodo_pago, propiedad_interesado, necesidades, observaciones 
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE clientes 
       SET nombre = $1, telefono = $2, fecha_ingreso = $3, presupuesto = $4, 
           metodo_pago = $5, propiedad_interesado = $6, necesidades = $7, observaciones = $8
       WHERE id = $9 
       RETURNING *`,
      [nombre, telefono, fecha_ingreso, presupuesto, metodo_pago, propiedad_interesado, necesidades, observaciones, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar cliente:', err.message);
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

// Ruta para ELIMINAR un cliente
app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar cliente:', err.message);
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

// (Aquí irían las rutas de Editar y Eliminar, también protegidas con authenticateToken)
// ... (copia las rutas de Editar y Eliminar del mensaje anterior aquí abajo, y agrega authenticateToken antes de la función async).
// Ruta para obtener la lista de usuarios (¡Solo para ADMIN!)
app.get('/api/usuarios', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    // Seleccionamos todo EXCEPTO el campo password_hash para seguridad
    const result = await pool.query('SELECT id, nombre, correo_electronico, telefono, rol FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err.message);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
  }
  // Ruta para ELIMINAR un usuario (¡Solo para ADMIN!)
app.delete('/api/usuarios/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Primero, desconectamos a ese asesor de sus clientes (ponemos NULL en asesor_id)
    await pool.query('UPDATE clientes SET asesor_id = NULL WHERE asesor_id = $1', [id]);
    // Luego eliminamos al usuario de la tabla
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err.message);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
});

// Ruta para CAMBIAR EL ROL de un usuario (¡Solo para ADMIN!)
app.put('/api/usuarios/:id/rol', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { nuevoRol } = req.body; // Esperamos que el frontend nos envíe 'admin' o 'vendedor'
  try {
    const result = await pool.query(
      'UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre, correo_electronico, telefono, rol',
      [nuevoRol, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al cambiar rol:', err.message);
    res.status(500).json({ error: 'Error al cambiar el rol del usuario' });
  }
});
});
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Backend corriendo en http://localhost:${PORT}`));