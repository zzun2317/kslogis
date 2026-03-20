// app/external/sabangnet/api/route.ts
import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function POST(req: Request) {
  try {
    const { startDate, endDate, orderStatus } = await req.json();
    
    const formattedStart = startDate.replace(/-/g, '');
    const formattedEnd = endDate.replace(/-/g, '');

    // 사방넷이 우리 XML 가이드를 읽어갈 주소 (쿼리스트링 포함)
    const xmlUrl = `https://kslogis.vercel.app/api/sabangnet/xml-guide?startDate=${formattedStart}&endDate=${formattedEnd}&orderStatus=${orderStatus}`;

    // 사방넷 서버에 "이 주소를 읽어서 데이터를 줘!"라고 요청
    const sabangEndpoint = `https://sbadmin12.sabangnet.co.kr/RTL_API/xml_order_info.html?xml_url=${encodeURIComponent(xmlUrl)}`;

    const response = await fetch(sabangEndpoint, { method: 'GET' });
    const xmlData = await response.text();

    const parser = new XMLParser({ trimValues: true });
    const jsonObj = parser.parse(xmlData);

    const orderData = jsonObj.SABANG_ORDER_LIST?.DATA || [];
    const ordersArray = Array.isArray(orderData) ? orderData : [orderData];

    return NextResponse.json({ success: true, data: ordersArray });
  } catch (error) {
    return NextResponse.json({ success: false, error: '수집 실패' }, { status: 500 });
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