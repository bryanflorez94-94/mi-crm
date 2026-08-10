import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'https://mi-crm-production-057a.up.railway.app/api';
function App() {
  // ----- ESTADO DE USUARIO Y LOGIN -----
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ correo: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // ----- ESTADO DEL CRM -----
  const [clientes, setClientes] = useState([]);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState({
    id: null, nombre: '', telefono: '', fecha_ingreso: '', presupuesto: '',
    metodo_pago: 'Efectivo', propiedad_interesado: '', necesidades: '', observaciones: ''
  });

  // ----- ESTADO PARA USUARIOS (SOLO ADMIN) -----
  const [showUserForm, setShowUserForm] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [userForm, setUserForm] = useState({
    nombre: '', correo_electronico: '', telefono: '', password: '', rol: 'vendedor'
  });
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [userCreateMsg, setUserCreateMsg] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (user) {
      cargarClientes();
      if (user.rol === 'admin') cargarUsuarios();
    }
  }, [user]);

  const handleLoginChange = (e) => {
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await axios.post(`${API_URL}/login`, {
        correo_electronico: loginForm.correo,
        password: loginForm.password
      });
      const userData = res.data.user;
      userData.token = res.data.token;
      localStorage.setItem('crm_user', JSON.stringify(userData));
      setUser(userData);
      setLoginForm({ correo: '', password: '' });
    } catch (error) {
      setLoginError('Credenciales incorrectas. Intenta de nuevo.');
      console.error(error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('crm_user');
    setUser(null);
    setClientes([]);
    setUsuarios([]);
    setShowUserForm(false);
  };

  const config = {
    headers: { Authorization: `Bearer ${user?.token}` }
  };

  const cargarClientes = async () => {
    try {
      const res = await axios.get(`${API_URL}/clientes`, config);
      setClientes(res.data);
    } catch (error) {
      if (error.response?.status === 401) handleLogout();
      console.error("Error al cargar clientes:", error);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre) return alert('El nombre es obligatorio');
    setCargando(true);
    try {
      let res;
      if (form.id) {
        res = await axios.put(`${API_URL}/clientes/${form.id}`, form, config);
        setClientes(clientes.map(c => c.id === form.id ? res.data : c));
      } else {
        res = await axios.post(`${API_URL}/clientes`, form, config);
        setClientes([res.data, ...clientes]);
      }
      setForm({
        id: null, nombre: '', telefono: '', fecha_ingreso: '', presupuesto: '',
        metodo_pago: 'Efectivo', propiedad_interesado: '', necesidades: '', observaciones: ''
      });
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      alert('Hubo un error al guardar el cliente');
      if (error.response?.status === 401) handleLogout();
    }
    setCargando(false);
  };

  const handleEditar = (cliente) => {
    setForm({
      id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono || '',
      fecha_ingreso: cliente.fecha_ingreso || '', presupuesto: cliente.presupuesto || '',
      metodo_pago: cliente.metodo_pago || 'Efectivo', propiedad_interesado: cliente.propiedad_interesado || '',
      necesidades: cliente.necesidades || '', observaciones: cliente.observaciones || ''
    });
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) return;
    try {
      await axios.delete(`${API_URL}/clientes/${id}`, config);
      setClientes(clientes.filter(c => c.id !== id));
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      alert('Hubo un error al eliminar el cliente');
      if (error.response?.status === 401) handleLogout();
    }
  };

  // ----- FUNCIONES PARA USUARIOS (ADMIN) -----
  const cargarUsuarios = async () => {
    try {
      const res = await axios.get(`${API_URL}/usuarios`, config);
      setUsuarios(res.data);
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
    }
  };

  const handleUserFormChange = (e) => {
    setUserForm({ ...userForm, [e.target.name]: e.target.value });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreandoUsuario(true);
    setUserCreateMsg('');
    try {
      const res = await axios.post(`${API_URL}/register`, userForm, config);
      setUserCreateMsg(`✅ Usuario ${res.data.nombre} creado exitosamente.`);
      setUserForm({ nombre: '', correo_electronico: '', telefono: '', password: '', rol: 'vendedor' });
      cargarUsuarios();
    } catch (error) {
      console.error("Error al crear usuario:", error);
      setUserCreateMsg('❌ Error al crear el usuario. Verifica que el correo no esté duplicado.');
    }
    setCreandoUsuario(false);
  };

  // --- NUEVAS FUNCIONES PARA GESTIONAR USUARIOS DESDE LA TABLA ---
  const handleEliminarUsuario = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este usuario y desvincularlo de sus clientes?')) return;
    try {
      await axios.delete(`${API_URL}/usuarios/${id}`, config);
      setUsuarios(usuarios.filter(u => u.id !== id));
      // Si el usuario eliminado era el que estaba logueado, cerramos sesión (opcional, pero seguro)
      if (id === user.id) handleLogout();
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      alert('Hubo un error al eliminar el usuario');
    }
  };

  const handleCambiarRol = async (id, rolActual) => {
    // Evitar que el admin se quite sus propios permisos
    if (id === user.id && rolActual === 'admin') {
      return alert('No puedes cambiarte el rol a ti mismo mientras estás logueado como Admin.');
    }

    const nuevoRol = rolActual === 'admin' ? 'vendedor' : 'admin';
    if (!window.confirm(`¿Estás seguro de cambiar el rol de este usuario a "${nuevoRol}"?`)) return;

    try {
      await axios.put(`${API_URL}/usuarios/${id}/rol`, { nuevoRol }, config);
      cargarUsuarios(); // Recargar la tabla para ver el cambio
    } catch (error) {
      console.error("Error al cambiar rol:", error);
      alert('Hubo un error al cambiar el rol del usuario');
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    const texto = terminoBusqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(texto) ||
      (c.telefono && c.telefono.includes(texto)) ||
      (c.propiedad_interesado && c.propiedad_interesado.toLowerCase().includes(texto))
    );
  });

  // ----- RENDERIZADO (VISTA) -----
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex items-center justify-center px-4">
        <div className="bg-white/80 backdrop-blur-sm px-10 pt-16 pb-10 rounded-2xl shadow-2xl w-full max-w-md border border-white/20">
          <div className="flex justify-center mb-6">
             <img src="/logo.png" alt="Logo Urbanistika" className="h-32 w-auto object-contain drop-shadow-xl" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-6">Bienvenido</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Correo Electrónico</label>
              <input type="email" name="correo" required value={loginForm.correo} onChange={handleLoginChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" placeholder="admin@micrm.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Contraseña</label>
              <input type="password" name="password" required value={loginForm.password} onChange={handleLoginChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" placeholder="••••••••" />
            </div>
            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 rounded-lg transition-colors shadow-md hover:shadow-lg mt-2">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-wrap sm:flex-nowrap sm:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-4">
             <img src="/logo.png" alt="Logo Urbanistika" className="h-12 w-auto object-contain" />
             <h1 className="text-xl font-bold text-slate-800 hidden sm:block">CRM</h1>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {user.rol === 'admin' && (
              <button onClick={() => setShowUserForm(!showUserForm)} className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-colors">
                {showUserForm ? '✕ Cerrar Gestión' : '⚙️ Gestionar Usuarios'}
              </button>
            )}
            <span className="text-sm text-slate-600">👤 {user.nombre} ({user.rol})</span>
            <button onClick={handleLogout} className="text-sm bg-red-100 text-red-600 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors">Cerrar Sesión</button>
          </div>
        </div>

        {/* PANEL DE ADMINISTRACIÓN */}
        {user.rol === 'admin' && showUserForm && (
          <div className="mb-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-fade-in-down">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">Gestión de Usuarios</h3>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-6 border-b pb-6 border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                <input name="nombre" required value={userForm.nombre} onChange={handleUserFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" placeholder="Ej: María Gomez" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Correo Electrónico</label>
                <input type="email" name="correo_electronico" required value={userForm.correo_electronico} onChange={handleUserFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" placeholder="maria@email.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono del Asesor</label>
                <input name="telefono" value={userForm.telefono} onChange={handleUserFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" placeholder="+57 300 123 4567" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña</label>
                <input type="password" name="password" required value={userForm.password} onChange={handleUserFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
                <select name="rol" value={userForm.rol} onChange={handleUserFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creandoUsuario} className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">
                  {creandoUsuario ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
            {userCreateMsg && <p className="mb-4 text-sm font-medium">{userCreateMsg}</p>}

            {/* TABLA DE USUARIOS CON ACCIONES */}
            <h4 className="font-medium text-slate-700 mb-3">Asesores y Administradores registrados:</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium hidden sm:table-cell">Correo</th>
                    <th className="px-4 py-2 font-medium hidden md:table-cell">Teléfono</th>
                    <th className="px-4 py-2 font-medium text-center">Rol</th>
                    <th className="px-4 py-2 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usuarios.length === 0 ? (
                    <tr><td colSpan="6" className="px-4 py-4 text-center text-slate-400">Aún no has creado ningún usuario.</td></tr>
                  ) : (
                    usuarios.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 font-mono text-xs text-slate-400">#{u.id}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{u.nombre}</td>
                        <td className="px-4 py-2 hidden sm:table-cell">{u.correo_electronico}</td>
                        <td className="px-4 py-2 hidden md:table-cell">{u.telefono || '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.rol === 'admin' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {u.rol}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center flex justify-center gap-2">
                          <button onClick={() => handleCambiarRol(u.id, u.rol)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors" title="Cambiar Rol">
                            🔄
                          </button>
                          <button onClick={() => handleEliminarUsuario(u.id)} className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors" title="Eliminar Usuario">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CRM PRINCIPAL (Formulario y Tabla de Clientes) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">{form.id ? 'Editar Cliente' : 'Agregar Cliente'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Nombre *</label>
                <input name="nombre" placeholder="Ej: Juan Pérez" value={form.nombre} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium text-slate-600 mb-1">Teléfono</label><input name="telefono" placeholder="+57 300..." value={form.telefono} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-600 mb-1">Fecha Ingreso</label><input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium text-slate-600 mb-1">Presupuesto ($)</label><input type="number" step="0.01" name="presupuesto" placeholder="0.00" value={form.presupuesto} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-600 mb-1">Método de Pago</label><select name="metodo_pago" value={form.metodo_pago} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="Efectivo">Efectivo</option><option value="Banco">Banco</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Propiedad Interesado</label><input name="propiedad_interesado" placeholder="Ej: Casa en el norte" value={form.propiedad_interesado} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Necesidades</label><textarea name="necesidades" rows="2" placeholder="¿Qué está buscando?" value={form.necesidades} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">Observaciones</label><textarea name="observaciones" rows="2" placeholder="Detalles adicionales..." value={form.observaciones} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="flex gap-2">
                <button type="submit" disabled={cargando} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">{cargando ? 'Guardando...' : (form.id ? 'Actualizar Cliente' : 'Guardar Cliente')}</button>
                {form.id && (<button type="button" onClick={() => setForm({ id: null, nombre: '', telefono: '', fecha_ingreso: '', presupuesto: '', metodo_pago: 'Efectivo', propiedad_interesado: '', necesidades: '', observaciones: '' })} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors">Cancelar</button>)}
              </div>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-700">Lista de Clientes</h2>
              <input type="text" placeholder="🔍 Buscar por nombre, teléfono..." value={terminoBusqueda} onChange={(e) => setTerminoBusqueda(e.target.value)} className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                  <tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium hidden sm:table-cell">Teléfono</th><th className="px-4 py-3 font-medium hidden md:table-cell">Fecha</th><th className="px-4 py-3 font-medium hidden lg:table-cell">Presupuesto</th><th className="px-4 py-3 font-medium hidden xl:table-cell">Pago</th><th className="px-4 py-3 font-medium text-center">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientesFiltrados.length === 0 ? (<tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">{clientes.length === 0 ? 'No hay clientes aún. ¡Agrega uno en el formulario!' : 'No se encontraron resultados con esa búsqueda.'}</td></tr>) : (
                    clientesFiltrados.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{c.nombre}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">{c.telefono || '-'}</td>
                        <td className="px-4 py-3 hidden md:table-cell">{new Date(c.fecha_ingreso).toLocaleDateString()}</td>
                        <td className="px-4 py-3 hidden lg:table-cell font-mono">{c.presupuesto ? `$${parseFloat(c.presupuesto).toFixed(2)}` : '-'}</td>
                        <td className="px-4 py-3 hidden xl:table-cell"><span className={`px-2 py-1 rounded-full text-xs font-medium ${c.metodo_pago === 'Banco' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{c.metodo_pago || '-'}</span></td>
                        <td className="px-4 py-3 flex justify-center gap-2">
                          <button onClick={() => handleEditar(c)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors" title="Editar">✏️</button>
                          <button onClick={() => handleEliminar(c.id)} className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors" title="Eliminar">🗑️</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;