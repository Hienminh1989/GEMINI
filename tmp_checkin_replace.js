const fs = require('fs');
let content = fs.readFileSync('src/pages/CheckIn.tsx', 'utf8');

// Replace fetchHistory
content = content.replace(/const fetchHistory = async \(\) => \{[\s\S]*?setLoadingHistory\(false\);\s*\}\s*\};\s*useEffect/m, `const fetchHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(\`/api/attendance?userId=\${user.uid}&orderByStr=desc&limitStr=15\`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data);
      }
    } catch (error) {
      console.warn("Lỗi khi lấy lịch sử:", error);
    } finally {
      setLoadingHistory(false);
    }
  };
  useEffect`);

// Replace initData
content = content.replace(/const initData = async \(\) => \{[\s\S]*?setLoadingInitial\(false\);\s*\}\s*\};\s*initData\(\);/m, `const initData = async () => {
      if (!user) return;
      try {
        const res = await fetch('/api/settings/config');
        if (res.ok) {
          const config = await res.json();
          setAppConfig(config);
        }
      } catch (error) {
        console.warn("Lỗi khi tải cấu hình:", error);
      } finally {
        setLoadingInitial(false);
      }
    };
    initData();`);

fs.writeFileSync('src/pages/CheckIn.tsx', content);
