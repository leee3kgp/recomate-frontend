// API Gateway 기본 주소
// 다른 서버로 빌드할 때만 VITE_API_BASE_URL 지정
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "https://rdjkqhp2el.execute-api.ap-southeast-2.amazonaws.com/dev";

// 서버에 연결하지 못했을 때 표시하는 문구
export const NETWORK_ERROR_MESSAGE =
    "인터넷 연결을 확인한 뒤 다시 시도해주세요.";
