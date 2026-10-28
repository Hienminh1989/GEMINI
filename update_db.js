async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/settings/config');
    let config = {};
    if (res.ok) {
       config = await res.json();
    }
    
    // Update config
    config.targetLat = 19.867470;
    config.targetLng = 105.676898;
    
    // Save to PG
    const putRes = await fetch('http://localhost:3000/api/settings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    
    console.log("Postgres update status:", putRes.status);
    
  } catch(e) {
    console.error(e);
  }
}
run();
