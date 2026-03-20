import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import iconv from 'iconv-lite';

export async function POST(req: Request) {
  try {
    const { startDate, endDate, orderStatus } = await req.json();
    
    // 1. 날짜 포맷 변경 (YYYY-MM-DD -> YYYYMMDD)
    const formattedStart = startDate.replace(/-/g, '');
    const formattedEnd = endDate.replace(/-/g, '');

    // 2. 사방넷이 읽어갈 우리 서버의 가이드 주소 (Vercel 주소 사용)
    const xmlUrl = `https://kslogis.vercel.app/api/sabangnet/xml-guide?startDate=${formattedStart}&endDate=${formattedEnd}&orderStatus=${orderStatus}`;
    // console.log("--------------------------------");
    // console.log("생성된 xmlUrl:", xmlUrl);
    // console.log("--------------------------------");

    // 3. 사방넷 API 엔드포인트 호출 (xml_url 파라미터에 우리 주소 전달)
    // 사방넷은 이 주소를 받으면 내부적으로 우리 xml-guide에 접속해서 인증키와 기간을 확인합니다.
    const sabangEndpoint = `https://sbadmin12.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    // console.log("사방넷 호출 URL:", sabangEndpoint);

    const response = await fetch(sabangEndpoint, {
      method: 'GET', // 사방넷 방식에 따라 GET으로 호출
      cache: 'no-store'
    });
    
    // 바이너리 데이터를 가져옵니다.
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. EUC-KR에서 UTF-8로 변환 (한글 복구!)
    const xmlData = iconv.decode(buffer, 'euc-kr');
    console.log("사방넷 실제 응답 내용:", xmlData);

    // 4. 결과값(XML)을 JSON으로 파싱
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true
    });
    const jsonObj = parser.parse(xmlData);

    // 사방넷 응답 구조에 맞춰 데이터 추출
    // 보통 <SABANG_ORDER_LIST><DATA><ORDER>... 형태로 옵니다.
    const orderData = jsonObj.SABANG_ORDER_LIST?.DATA || [];
    const ordersArray = Array.isArray(orderData) ? orderData : [orderData];

    return NextResponse.json({ 
      success: true, 
      data: ordersArray,
      count: ordersArray.length 
    });

  } catch (error: any) {
    console.error('사방넷 수집 에러:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || '데이터 수집 중 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}
