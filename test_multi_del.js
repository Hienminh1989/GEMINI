fetch('http://localhost:3000/api/attendance?limitStr=1')
  .then(res => res.json())
  .then(data => {
    if (data.length > 0) {
      console.log('Deleting records for userId:', data[0].userId, 'dateStr:', data[0].dateStr);
      // Let's pretend we run the logic in handleDeleteUserDayRecords
      fetch('http://localhost:3000/api/attendance')
        .then(res => res.json())
        .then(all => {
          const recordsToDelete = all.filter(r => r.userId === data[0].userId && r.dateStr === data[0].dateStr);
          console.log('Found records to delete:', recordsToDelete.length);
          let promises = recordsToDelete.map(record => 
            fetch('http://localhost:3000/api/attendance/' + record.id, { method: 'DELETE' }).then(r=>r.json())
          );
          Promise.all(promises).then(results => {
            console.log('Delete results:', results);
          });
        });
    }
  });
