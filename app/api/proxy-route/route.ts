import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { origin, destination, waypoints } = await req.json();
    
    // 본인의 REST API 키로 교체하세요
    const KAKAO_REST_KEY = 'f9b7bc545a407780f8e1dd0c5d2caf3c'; 

    // ⭐️ 중요: 5개 제한을 피하려면 파라미터 구성이 중요합니다.
    // waypoints가 비어있지 않을 때만 &waypoints= 를 추가합니다.
    const waypointsParam = waypoints ? `&waypoints=${waypoints}` : '';
    
    // 반드시 'apis-navi.kakaomobility.com' 주소여야 합니다.
     const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}${waypointsParam}&priority=RECOMMEND`;
    //const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=127.0457,37.7853&destination=127.0459,37.7381&waypoints=127.0443,37.7753|127.0436,37.7593&priority=RECOMMEND`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `KakaoAK ${KAKAO_REST_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (!res.ok) {
      // 여기서 찍히는 로그가 가장 중요합니다. 
      // 만약 여전히 5개 제한이 뜬다면 서버 주소 오타일 가능성이 큽니다.
      console.error('카카오 API 서버 응답 실패:', data);
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('서버 내부 에러:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}