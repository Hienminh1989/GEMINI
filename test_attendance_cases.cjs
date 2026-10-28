const http = require('http');

async function sendRequest(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/attendance',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("Test 1: Normal In");
  const r1 = await sendRequest({
    userId: "1",
    userName: "Nguyễn Văn A",
    department: "Khoa Khám Bệnh",
    type: "in",
    location: { lat: 19.866034, lng: 105.656531, accuracy: 10 },
    deviceInfo: { fingerprint: "fp_test_1", os: "Android", browser: "Chrome" }
  });
  console.log("R1 status:", r1.statusCode, "Body:", r1.body);

  console.log("\nTest 2: Normal Out");
  const r2 = await sendRequest({
    userId: "1",
    userName: "Nguyễn Văn A",
    department: "Khoa Khám Bệnh",
    type: "out",
    location: { lat: 19.866034, lng: 105.656531, accuracy: 10 },
    deviceInfo: { fingerprint: "fp_test_1", os: "Android", browser: "Chrome" }
  });
  console.log("R2 status:", r2.statusCode, "Body:", r2.body);

  console.log("\nTest 3: Missing Location or invalid location");
  const r3 = await sendRequest({
    userId: "1",
    userName: "Nguyễn Văn A",
    department: "Khoa Khám Bệnh",
    type: "in",
    location: { lat: null, lng: null },
    deviceInfo: {}
  });
  console.log("R3 status:", r3.statusCode, "Body:", r3.body);

  console.log("\nTest 4: Empty body");
  const r4 = await sendRequest({});
  console.log("R4 status:", r4.statusCode, "Body:", r4.body);
}

run();
