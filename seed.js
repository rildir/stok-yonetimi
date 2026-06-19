const http = require('http');

const API_URL = 'http://localhost:3000/api';

async function fetchApi(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    
    const req = http.request(options, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(respData ? JSON.parse(respData) : {});
        } else {
          reject(`Error ${res.statusCode}: ${respData}`);
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

async function seed() {
  try {
    console.log('Logging in...');
    const loginRes = await fetchApi('/auth/login', 'POST', { username: 'admin', password: 'admin' });
    const token = loginRes.token;
    console.log('Logged in successfully.');

    console.log('Creating suppliers...');
    const sup1 = await fetchApi('/suppliers', 'POST', {
      name: 'Tech supplies A.Ş.',
      contactPerson: 'Ali Veli',
      email: 'info@techsupplies.com',
      phone: '+90 555 123 4567',
      address: 'Teknokent, İstanbul'
    }, token);

    const sup2 = await fetchApi('/suppliers', 'POST', {
      name: 'Ofis Merkezi Ltd. Şti.',
      contactPerson: 'Ayşe Yılmaz',
      email: 'satis@ofismerkezi.com',
      phone: '+90 555 987 6543'
    }, token);

    console.log('Creating products...');
    const productsToCreate = [
      { name: 'Logitech MX Master 3S', sku: 'LOGI-MX3S-001', category: 'Accessories', price: 2950.00, quantity: 45, minQuantity: 10, supplierId: sup1.id, imageUrl: 'https://resource.logitech.com/w_692,c_lpad,ar_4:3,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-3s/gallery/mx-master-3s-mouse-top-view-graphite.png?v=1' },
      { name: 'Dell UltraSharp 27', sku: 'DELL-U2722D', category: 'Monitors', price: 12500.00, quantity: 12, minQuantity: 5, supplierId: sup1.id },
      { name: 'Ergonomik Ofis Koltuğu', sku: 'FURN-ERGO-01', category: 'Furniture', price: 4500.00, quantity: 3, minQuantity: 5, supplierId: sup2.id },
      { name: 'Sony WH-1000XM5', sku: 'SONY-WHXM5', category: 'Audio', price: 11000.00, quantity: 20, minQuantity: 8, supplierId: sup1.id },
      { name: 'Apple AirPods Pro 2', sku: 'AAPL-APP2', category: 'Audio', price: 8500.00, quantity: 0, minQuantity: 5, supplierId: sup1.id }
    ];

    const products = [];
    for (const p of productsToCreate) {
      const saved = await fetchApi('/products', 'POST', p, token);
      products.push(saved);
    }
    console.log('Products created.');

    console.log('Creating purchase order...');
    const po = await fetchApi('/purchase-orders', 'POST', {
      supplierId: sup1.id,
      supplierName: sup1.name,
      expectedDate: '2026-06-25',
      notes: 'Acil sipariş',
      items: [
        { productId: products[4].id, productName: products[4].name, quantity: 25 },
        { productId: products[1].id, productName: products[1].name, quantity: 10 }
      ]
    }, token);

    console.log('Receiving purchase order...');
    await fetchApi(`/purchase-orders/${po.id}/status`, 'PUT', { status: 'Received' }, token);

    console.log('Creating and completing an order...');
    const order = await fetchApi('/orders', 'POST', {
      customerName: 'Ahmet İldir',
      totalAmount: 11000.00,
      items: [
        { productId: products[3].id, productName: products[3].name, quantity: 1, unitPrice: 11000.00 }
      ]
    }, token);

    await fetchApi(`/orders/${order.id}/status`, 'PUT', { status: 'Completed' }, token);

    console.log('Seed completed successfully!');
  } catch (err) {
    console.error('Seed failed:', err);
  }
}

seed();
