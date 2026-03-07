let state = {
  config: { 
    scriptUrl: '', 
    bizName: 'Librería Virtual', 
    currency: 'MXN', 
    minStock: 3,
    minMargin: 20 
  },
  currentUser: null,
  isFirstSetup: false,
  users: [],
  products: [],
  customers: [], // Aquí se manejan los acumulados/direcciones
  sales: [],     // Aquí se guardan las ventas y abonos
  providers: [], // Agenda de visitas
  cart: [],
  editingProductId: null,
  editingCustomerId: null,
  editingUserId: null,
  editingProviderId: null,
  scannerTarget: 'pos', 
  scannerStream: null,
  scannerInterval: null,
  currentCat: '',
  lastReceiptData: null,
};

// 2. CONSTANTES DE LOCALSTORAGE
const CONFIG_KEY = 'bookflow_config';
const PRODUCTS_KEY = 'bookflow_products';
const CUSTOMERS_KEY = 'bookflow_customers';
const SALES_KEY = 'bookflow_sales';
const USERS_KEY = 'bookflow_users';
const PROVIDERS_KEY = 'bookflow_providers';

// 3. FORMATEADOR DE MONEDA
const formatMoney = (amount) => {
  return new Intl.NumberFormat('es-MX', { 
    style: 'currency', 
    currency: state.config.currency || 'MXN' 
  }).format(amount || 0);
};

// INICIALIZACIÓN (FLUJO CORREGIDO)
window.addEventListener('load', async () => {
  loadLocal();
  
  // Event Listeners base
  const barcodeInput = document.getElementById('barcode-input');
  if(barcodeInput) {
    barcodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { 
        addByBarcode(e.target.value.trim()); 
        e.target.value = ''; 
      }
    });
  }

  const discountInput = document.getElementById('discount-input');
  if(discountInput) discountInput.addEventListener('input', updateCartUI);

  setDefaultDates();

  // Lógica de ruteo inicial
  if (!state.config.scriptUrl) {
    showSetup();
  } else {
    // 1. Mostrar pantalla de bloqueo por defecto mientras carga
    document.getElementById('setup-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
    document.querySelector('.numpad').style.opacity = '0.5'; // Desactivar visualmente el teclado mientras sincroniza
    
    // 2. Descargar base de datos obligatoriamente
    await syncAll();
    document.querySelector('.numpad').style.opacity = '1';

    // 3. Validar si no hay usuarios en la base de datos (Instalación nueva)
    if (state.users.length === 0) {
      document.getElementById('lock-screen').style.display = 'none';
      state.isFirstSetup = true;
      openUserModal(null, true);
    }
  }
});

    // Bloqueo visual durante sync inicial
    const numpad = document.querySelector('.numpad');
    if(numpad) numpad.style.opacity = '0.5'; 
    
    await syncAll();
    
    if(numpad) numpad.style.opacity = '1';

    // Validación de instalación nueva
    if (state.users.length === 0) {
      document.getElementById('lock-screen').style.display = 'none';
      state.isFirstSetup = true;
      openUserModal(null, true); 
    }
  }
});

// 5. PERSISTENCIA LOCAL
function loadLocal() {
  const c = localStorage.getItem(CONFIG_KEY); if (c) state.config = { ...state.config, ...JSON.parse(c) };
  const p = localStorage.getItem(PRODUCTS_KEY); if (p) state.products = JSON.parse(p);
  const cu = localStorage.getItem(CUSTOMERS_KEY); if (cu) state.customers = JSON.parse(cu);
  const s = localStorage.getItem(SALES_KEY); if (s) state.sales = JSON.parse(s);
  const u = localStorage.getItem(USERS_KEY); if (u) state.users = JSON.parse(u);
  const pr = localStorage.getItem(PROVIDERS_KEY); if (pr) state.providers = JSON.parse(pr);
}

function saveLocal() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(state.products));
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(state.customers));
  localStorage.setItem(SALES_KEY, JSON.stringify(state.sales));
  localStorage.setItem(USERS_KEY, JSON.stringify(state.users));
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(state.providers));
}

// 6. FLUJO DE VENTAS CON ENFOQUE EN ACUMULADOS
async function checkout(method, amountReceived = 0) {
  if (!state.cart.length) { toast('Carrito vacío', 'error'); return; }
  if (!state.currentUser) { toast('Inicie sesión', 'error'); return; }

  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const disc = parseFloat(document.getElementById('discount-input').value) || 0;
  const total = subtotal * (1 - disc/100);
  
  const custId = document.getElementById('cart-customer').value;
  if (!custId) { toast('Seleccione un cliente para el acumulado', 'warning'); return; }

  const customer = state.customers.find(c => c.id === custId);

  const sale = {
    id: 'S' + Date.now(),
    date: new Date().toISOString(),
    total: total.toFixed(2),
    amountReceived: method === 'Efectivo' ? amountReceived : total,
    change: method === 'Efectivo' ? (amountReceived - total).toFixed(2) : 0,
    customerId: custId,
    customerName: customer.name,
    sellerName: state.currentUser.name,
    itemsCount: state.cart.length,
    courier: customer.preferredCourier || 'No definido', // Se toma del perfil del cliente
    status: (amountReceived >= total) ? 'Pagado' : 'Abono/Pendiente'
  };

  // Actualizar acumulado del cliente localmente
  customer.totalDebt = (parseFloat(customer.totalDebt || 0) + total).toFixed(2);
  customer.totalPaid = (parseFloat(customer.totalPaid || 0) + amountReceived).toFixed(2);

  state.sales.unshift(sale);
  saveLocal();
  
  // Sincronizar con Google Sheets
  setSyncStatus(null, 'Guardando acumulado...');
  
  const rowsToSync = [sale];
  const response = await apiCall({ action: 'write', tab: 'Ventas', rows: rowsToSync });
  
  if (response?.ok) {
    // Actualizar también la fila del cliente en Sheets
    await apiCall({ 
      action: 'updateRow', 
      tab: 'Clientes', 
      idField: 'id', 
      idValue: custId, 
      updates: { 
        totalDebt: customer.totalDebt, 
        totalPaid: customer.totalPaid 
      } 
    });
    setSyncStatus(true, 'Sincronizado');
    toast('Acumulado actualizado', 'success');
  }

  clearCart();
  renderCRM(); // Actualizar lista de clientes
}

// 7. ROLES Y SEGURIDAD (Cajero vs Admin)
function applyRoles(role) {
  const isAdmin = role === 'admin';
  const isCajero = role === 'cajero';

  // El administrador es el único que ve los acumulados globales y gestión de usuarios
  const adminOnlyElements = ['nav-reports', 'nav-users', 'admin-summary-box'];
  adminOnlyElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });

  // Los cajeros solo ven POS, Clientes y Proveedores (Visitas)
  const navHistory = document.getElementById('nav-sales-hist');
  if(navHistory) navHistory.classList.toggle('hide-for-cajero', isCajero);
}

// 8. SINCRONIZACIÓN INTEGRAL
async function syncAll() {
  setSyncStatus(null, 'Descargando datos...');
  
  const [p, c, s, u, pr] = await Promise.all([
    apiCall({ action: 'read', tab: 'Productos' }),
    apiCall({ action: 'read', tab: 'Clientes' }),
    apiCall({ action: 'read', tab: 'Ventas' }),
    apiCall({ action: 'read', tab: 'Usuarios' }),
    apiCall({ action: 'read', tab: 'Proveedores' })
  ]);

  if (p?.ok) state.products = p.rows.filter(r => r.id);
  if (c?.ok) state.customers = c.rows.filter(r => r.id);
  if (s?.ok) state.sales = s.rows.filter(r => r.id);
  if (u?.ok) state.users = u.rows.filter(r => r.id);
  if (pr?.ok) state.providers = pr.rows.filter(r => r.id);
  
  saveLocal();
  renderAllViews();
  setSyncStatus(true, 'Sistema Online');
}

function renderAllViews() {
  renderInventory(); 
  renderPOSProducts(); 
  renderCRM(); 
  populateCustomerSelect(); 
  renderHistory();
  if(state.currentUser?.role === 'admin') renderReports();
}
