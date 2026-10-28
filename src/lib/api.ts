export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  message?: string;
}

export async function apiFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<ApiResponse<T>> {
  const timeoutMs = init?.timeoutMs || 10000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const fetchInit: RequestInit = {
      ...init,
      signal: init?.signal || (controller ? controller.signal : undefined)
    };

    const res = await fetch(input, fetchInit);
    if (timer) clearTimeout(timer);
    const text = await res.text();

    let parsedData: any = null;
    let parseSuccess = false;

    if (text && text.trim().length > 0) {
      try {
        parsedData = JSON.parse(text);
        parseSuccess = true;
      } catch (err) {
        parseSuccess = false;
      }
    } else {
      // Empty body
      parsedData = null;
      parseSuccess = true;
    }

    if (!parseSuccess) {
      console.warn(`[apiFetch] Response from ${input.toString()} is not valid JSON (${res.status}):`, text.slice(0, 150));
      return {
        ok: false,
        status: res.status,
        data: null,
        error: res.ok
          ? 'Máy chủ phản hồi dữ liệu không đúng định dạng. Vui lòng thử lại sau.'
          : (res.status === 404
              ? 'Không tìm thấy chức năng này trên hệ thống (404).'
              : `Máy chủ phản hồi lỗi (${res.status}). Vui lòng thử lại sau giây lát.`)
      };
    }

    const errorMessage = !res.ok 
      ? (parsedData?.error || parsedData?.message || `Yêu cầu thất bại (Mã lỗi: ${res.status})`)
      : undefined;

    return {
      ok: res.ok,
      status: res.status,
      data: parsedData,
      error: errorMessage,
      message: parsedData?.message
    };
  } catch (netErr: any) {
    console.error(`[apiFetch] Network/Fetch error on ${input.toString()}:`, netErr);
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại kết nối mạng 4G/Wi-Fi của bạn.'
    };
  }
}
