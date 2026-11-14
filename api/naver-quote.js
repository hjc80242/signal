export default function handler(req, res) {
  res
    .status(503)
    .json({
      error: "네이버 실시간 현재가 API 연결 불가. 일별 차트만 제공합니다.",
    });
}
