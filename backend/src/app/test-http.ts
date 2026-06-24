import axios from 'axios';

async function run() {
  const baseUrl = 'http://localhost:3000/api';
  console.log('Logging in...');
  try {
    const loginRes = await axios.post(`${baseUrl}/auth/login`, {
      username: 'admin',
      password: 'admin'
    });
    const token = loginRes.data.token;
    console.log('Login successful. Token acquired.');

    const headers = { Authorization: `Bearer ${token}` };

    console.log('\n--- Fetching movements with startDate=2026-06-19 and endDate=2026-06-19 ---');
    const resDate = await axios.get(`${baseUrl}/stock-movements`, {
      headers,
      params: {
        startDate: '2026-06-19',
        endDate: '2026-06-19'
      }
    });
    console.log(`HTTP Status: ${resDate.status}`);
    console.log(`Total items: ${resDate.data.total}`);
    console.log(`Data returned: ${resDate.data.data.length}`);
    console.log(resDate.data.data.map((d: any) => ({ name: d.productName, date: d.createdAt })));

    console.log('\n--- Fetching movements with type=IN ---');
    const resType = await axios.get(`${baseUrl}/stock-movements`, {
      headers,
      params: {
        type: 'IN'
      }
    });
    console.log(`HTTP Status: ${resType.status}`);
    console.log(`Total items: ${resType.data.total}`);
    console.log(resType.data.data.map((d: any) => ({ name: d.productName, type: d.type })));
  } catch (err: any) {
    console.error('Error during HTTP requests:', err.response?.data || err.message);
  }
}

run();
