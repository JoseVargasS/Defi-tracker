// Test script to verify Etherscan V2 API
const ETH_API = 'https://api.etherscan.io/v2/api';
const ETH_KEY = 'F7F8ZYHRFCQU3CC3H8R15A5E3NN5GH1CU4';
const address = '0xf6d3aedd0b73b112899619628fc5badb52fcb2ba';

const url = `${ETH_API}?chainid=1&module=account&action=txlist&address=${address}&sort=desc&apikey=${ETH_KEY}`;

console.log('Testing URL:', url);

fetch(url)
  .then(r => r.json())
  .then(data => {
    console.log('Response:', data);
    if (data.result && Array.isArray(data.result)) {
      console.log(`✅ Got ${data.result.length} transactions`);
    } else {
      console.log('❌ No transactions or error:', data.message);
    }
  })
  .catch(e => console.error('Error:', e));
