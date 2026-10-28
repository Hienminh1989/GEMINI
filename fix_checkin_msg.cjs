const fs = require('fs');
let code = fs.readFileSync('src/pages/CheckIn.tsx', 'utf-8');

code = code.replace(
  /if \(result\.status === 'out_of_range'\) \{\s*setLocationDetails\(\{ \.\.\.locDetails, distance: result\.distance \}\);\s*\}/g,
  `if (result.status === 'out_of_range') {
            setLocationDetails({ ...locDetails, distance: result.distance });
            if (locDetails.accuracy && locDetails.accuracy > 100) {
               result.error = result.error + ' (LƯU Ý: Sai số GPS thiết bị của bạn đang rất cao: ' + Math.round(locDetails.accuracy) + 'm. Hãy bật Wi-Fi, 4G, hoặc ra ngoài trời để bắt GPS chính xác hơn)';
            }
        }`
);

fs.writeFileSync('src/pages/CheckIn.tsx', code);
