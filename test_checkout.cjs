const http = require('http');

const data = JSON.stringify({
  userId: "1", 
  userName: "tester", 
  department: "A", 
  type: "out", 
  location: {lat: 19.867467, lng: 105.676884}
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/attendance',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
