// API Gateway 기본 주소
// 다른 서버로 빌드할 때만 VITE_API_BASE_URL 지정
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "https://rdjkqhp2el.execute-api.ap-southeast-2.amazonaws.com/dev";
