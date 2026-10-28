fetch('http://localhost:3000/api/attendance?limitStr=5')
  .then(res => res.json())
  .then(data => console.log('Sample dates:', data.map(d => d.dateStr)));
