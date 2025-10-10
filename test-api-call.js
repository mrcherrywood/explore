const fetch = require('node-fetch');

async function testAPI() {
  const baseUrl = 'http://localhost:3000';
  
  // Test the maps/contracts endpoint
  const params = new URLSearchParams({
    state: 'ALL',
    planTypeGroup: 'ALL',
    contractSeries: 'H_ONLY',
    enrollmentLevel: 'all',
    year: '2025'
  });
  
  console.log('Testing /api/maps/contracts endpoint...');
  console.log('URL:', `${baseUrl}/api/maps/contracts?${params.toString()}`);
  
  try {
    const response = await fetch(`${baseUrl}/api/maps/contracts?${params.toString()}`);
    const contentType = response.headers.get('content-type');
    
    console.log('\nStatus:', response.status, response.statusText);
    console.log('Content-Type:', contentType);
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      
      if (!response.ok) {
        console.error('\n❌ Error Response:');
        console.error(JSON.stringify(data, null, 2));
      } else {
        console.log('\n✅ Success!');
        console.log('Contract count:', data.contracts?.length || 0);
        console.log('Data year:', data.dataYear);
      }
    } else {
      const text = await response.text();
      console.log('\nResponse:', text.substring(0, 500));
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

testAPI();
