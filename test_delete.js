fetch('http://localhost:3000/api/attendance?limitStr=1')
  .then(res => res.json())
  .then(data => {
    console.log(data);
  });
