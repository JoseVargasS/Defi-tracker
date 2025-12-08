console.log('Testing transactions import');
import('./js/transactions.js').then(m => {
  console.log('Transactions module:', m);
  console.log('fetchAndShowTransactions:', m.fetchAndShowTransactions);
}).catch(e => console.error('Import error:', e));
