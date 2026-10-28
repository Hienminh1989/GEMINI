import { AttendanceRecord } from '../types';
import { format } from 'date-fns';

export const exportToGoogleSheets = async (
  accessToken: string,
  records: AttendanceRecord[],
  dateStr: string
): Promise<string> => {
  // 1. Create a new spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: `Điểm danh - ${dateStr}`,
      },
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json();
    console.error('Lỗi khi tạo Google Sheet:', errorData);
    throw new Error('Không thể tạo file Google Sheet.');
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;

  // 2. Format records into rows
  const headers = [
    'Tên nhân viên',
    'Thời gian',
    'Ngày',
    'Loại',
    'Trạng thái',
    'Khoa/Phòng',
    'Vĩ độ',
    'Kinh độ',
    'Mã thiết bị (Device ID)',
    'Thiết bị',
    'Hệ điều hành',
    'Trình duyệt',
    'Ghi chú',
  ];

  const rows = records.map((r) => [
    r.userName,
    format(new Date(r.timestamp), 'HH:mm:ss'),
    r.dateStr,
    r.type === 'in' ? 'Vào' : 'Ra',
    r.status === 'success' ? 'Thành công' : (r.status === 'invalid_qr' ? 'Mã QR lỗi' : (r.status === 'error' ? 'Lỗi hệ thống/GPS' : 'Sai vị trí')),
    r.department || '',
    r.location?.lat || '',
    r.location?.lng || '',
    r.deviceInfo?.deviceId || '',
    r.deviceInfo?.deviceType || '',
    r.deviceInfo?.os || '',
    r.deviceInfo?.browser || '',
    r.reason || '',
  ]);

  const values = [headers, ...rows];

  // 3. Append data to the newly created sheet
  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values,
    }),
  });
// phan trang và cho phép lưu lại dữ liệu.
  if (!updateRes.ok) {
    const errorData = await updateRes.json();
    console.error('Lỗi khi cập nhật Google Sheet:', errorData);
    throw new Error('Không thể thêm dữ liệu vào Google Sheet.');
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
};
