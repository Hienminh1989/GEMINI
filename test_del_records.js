fetch('http://localhost:3000/api/attendance')
  .then(res => res.json())
  .then(data => {
    console.log("All records:", data.length);
    console.log("Sample:", data[0]);
  });
