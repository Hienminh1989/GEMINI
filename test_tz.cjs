process.env.TZ = 'Asia/Ho_Chi_Minh';
const { format } = require('date-fns');
console.log(format(new Date(), 'yyyy-MM-dd HH:mm:ss'));
