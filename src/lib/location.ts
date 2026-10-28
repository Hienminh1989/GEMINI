import { getDistance } from 'geolib';

export const HOSPITAL_COORDS = {
  latitude: 19.866034,
  longitude: 105.656531
};

export const MAX_RADIUS_METERS = 600;

export interface LocationCheckResult {
  valid: boolean;
  distance: number;
  maxRadius: number;
  targetCoords: { latitude: number; longitude: number };
}

export const checkLocationValid = (
  lat: number, 
  lng: number, 
  customRadius?: number | string, 
  customLat?: number | string, 
  customLng?: number | string
): LocationCheckResult => {
  try {
    const numLat = customLat !== undefined && customLat !== null && customLat !== '' ? Number(customLat) : NaN;
    const numLng = customLng !== undefined && customLng !== null && customLng !== '' ? Number(customLng) : NaN;
    const numRadius = customRadius !== undefined && customRadius !== null && customRadius !== '' ? Number(customRadius) : NaN;

    const targetCoords = (!isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0) 
      ? { latitude: numLat, longitude: numLng }
      : HOSPITAL_COORDS;
      
    const maxRadius = (!isNaN(numRadius) && numRadius > 0) ? numRadius : MAX_RADIUS_METERS;

    const distance = getDistance(
      { latitude: Number(lat), longitude: Number(lng) },
      targetCoords
    );
    
    return {
      valid: distance <= maxRadius,
      distance,
      maxRadius,
      targetCoords
    };
  } catch (error) {
    console.error("Lỗi tính toán khoảng cách:", error);
    return {
      valid: false,
      distance: 999999,
      maxRadius: MAX_RADIUS_METERS,
      targetCoords: HOSPITAL_COORDS
    };
  }
};

/**
 * Lấy vị trí GPS chính xác bằng Geolocation API với nhiều mức dự phòng
 */
export const getAccurateLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator || !navigator.geolocation) {
      reject(new Error("Thiết bị hoặc trình duyệt không hỗ trợ GPS định vị."));
      return;
    }

    const optionsHigh = {
      enableHighAccuracy: true,
      timeout: 7000,
      maximumAge: 15000
    };

    const optionsLow = {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 30000
    };

    // 1. Thử High Accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (errHigh) => {
        // Nếu người dùng từ chối quyền (code 1 = PERMISSION_DENIED)
        if (errHigh && errHigh.code === 1) {
          reject(new Error("Quyền truy cập vị trí bị từ chối. Vui lòng cho phép quyền vị trí trên trình duyệt."));
          return;
        }
        
        // 2. Thử lại với Low Accuracy (Network / Cell tower / Wifi)
        navigator.geolocation.getCurrentPosition(
          (posLow) => resolve(posLow),
          (errLow) => {
            if (errLow && errLow.code === 1) {
              reject(new Error("Quyền truy cập vị trí bị từ chối. Vui lòng cho phép quyền vị trí trên trình duyệt."));
            } else {
              reject(new Error("Không thể xác định vị trí GPS. Vui lòng bật dịch vụ định vị (Vị trí) trên điện thoại và thử lại."));
            }
          },
          optionsLow
        );
      },
      optionsHigh
    );
  });
};
