fetch('http://localhost:3000/api/attendance?limitStr=1')
  .then(res => res.json())
  .then(data => {
    if(data.length > 0) {
      console.log('Trying to delete', data[0].id);
      fetch('http://localhost:3000/api/attendance/' + data[0].id, { method: 'DELETE' })
        .then(r => r.json())
        .then(d => console.log('Delete result:', d));
    }
  });
