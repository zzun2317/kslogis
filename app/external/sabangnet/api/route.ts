import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function POST(req: Request) {
  try {
    const { startDate, endDate, orderStatus } = await req.json();
    
    // 1. 날짜 포맷 변경 (YYYY-MM-DD -> YYYYMMDD)
    const formattedStart = startDate.replace(/-/g, '');
    const formattedEnd = endDate.replace(/-/g, '');

    // 2. 사방넷이 읽어갈 우리 서버의 가이드 주소 (Vercel 주소 사용)
    const xmlUrl = `https://kslogis.vercel.app/api/sabangnet/xml-guide?startDate=${formattedStart}&endDate=${formattedEnd}&orderStatus=${orderStatus}`;

    // 3. 사방넷 API 엔드포인트 호출 (xml_url 파라미터에 우리 주소 전달)
    // 사방넷은 이 주소를 받으면 내부적으로 우리 xml-guide에 접속해서 인증키와 기간을 확인합니다.
    const sabangEndpoint = `https://sbadmin12.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    console.log("사방넷 호출 URL:", sabangEndpoint);

    const response = await fetch(sabangEndpoint, {
      method: 'GET', // 사방넷 방식에 따라 GET으로 호출
      cache: 'no-store'
    });

    const xmlData = await response.text();
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

// import { NextResponse } from 'next/server';
// import { XMLBuilder, XMLParser } from 'fast-xml-parser';

// export async function POST(req: Request) {
//   try {
//     const { startDate, endDate, orderStatus } = await req.json();

//     // 1. 사방넷 요청 XML 생성 (명세서 기준)
//     const builder = new XMLBuilder({ ignoreAttributes: false });
//     const requestObj = {
//       SABANG_ORDER_LIST: {
//         HEADER: {
//           SEND_COMPAYNY_ID: process.env.SABANG_ID, // .env에 저장 권장
//           SEND_AUTH_KEY: process.env.SABANG_AUTH_KEY,
//           SEND_DATE: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
//         },
//         DATA: {
//           ORD_ST_DATE: startDate.replace(/-/g, ''),
//           ORD_ED_DATE: endDate.replace(/-/g, ''),
//           // 요청필드 리스트 나열
//           ORD_FIELD: "IDX|ORDER_ID|MALL_ID|MALL_USER_ID|ORDER_STATUS|USER_ID|USER_NAME|USER_TEL|USER_CEL|RECEIVE_TEL|RECEIVE_CEL|DELV_MSG|RECEIVE_NAME|RECEIVE_ZIPCODE|RECEIVE_ADDR|ORDER_DATE|PARTNER_ID|DPARTNER_ID|MALL_PRODUCT_ID|PRODUCT_ID|SKU_ID|P_PRODUCT_NAME|P_SKU_VALUE|PRODUCT_NAME|SALE_CNT|DELIVERY_METHOD_STR|DELV_COST|COMPAYNY_GOODS_CD|SKU_ALIAS|BOX_EA|MALL_ORDER_SEQ|MALL_ORDER_ID|ETC_FIELD3|ORDER_GUBUN|P_EA|REG_DATE|ord_field2|copy_idx|ORD_CONFIRM_DATE|RTN_DT|CHNG_DT|DELIVERY_CONFIRM_DATE|CANCEL_DT|DELIVERY_ID|INVOICE_NO|HOPE_DELV_DATE|MODEL_NO|ETC_MSG|DELV_MSG1|MUL_DELV_MSG|FREE_GIFT|ACNT_REGS_SRNO|MODEL_NAME",
//           ORDER_STATUS: orderStatus,
//           LANG: "UTF-8" // UTF-8 출력을 위해 명시 [cite: 4, 11]
//         }
//       }
//     };

//     const xmlRequest = builder.build(requestObj);

//     // 2. 사방넷 서버로 요청 전송 (사방넷 API 엔드포인트 URL 확인 필요)
//     const response = await fetch('https://sbadmin12.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=https://kslogis.vercel.app', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/xml' },
//       body: xmlRequest,
//     });

//     const xmlData = await response.text();

//     // 3. XML을 JSON으로 파싱
//     const parser = new XMLParser({
//       cdataPropName: "__cdata", // CDATA 섹션 처리
//       trimValues: true
//     });
//     const jsonObj = parser.parse(xmlData);

//     // 4. 데이터 추출 및 응답
//     const orderData = jsonObj.SABANG_ORDER_LIST?.DATA || [];
//     // 데이터가 단건일 경우 배열로 변환하는 예외처리
//     const ordersArray = Array.isArray(orderData) ? orderData : [orderData];

//     return NextResponse.json({ success: true, data: ordersArray });

//   } catch (error) {
//     console.error('사방넷 연동 에러:', error);
//     return NextResponse.json({ success: false, error: '데이터 수집 중 오류 발생' }, { status: 500 });
//   }
// }