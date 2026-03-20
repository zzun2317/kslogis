// app/api/sabangnet/xml-guide/route.ts
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const orderStatus = searchParams.get('orderStatus') || '002';

  // 사방넷 규격에 맞는 XML 생성
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<SABANG_ORDER_LIST>
  <HEADER>
    <SEND_COMPAYNY_ID>${process.env.SABANG_ID}</SEND_COMPAYNY_ID>
    <SEND_AUTH_KEY>${process.env.SABANG_AUTH_KEY}</SEND_AUTH_KEY>
    <SEND_DATE>${new Date().toISOString().slice(0, 10).replace(/-/g, '')}</SEND_DATE>
  </HEADER>
  <DATA>
    <ORD_ST_DATE>${startDate}</ORD_ST_DATE>
    <ORD_ED_DATE>${endDate}</ORD_ED_DATE>
    <ORD_FIELD><![CDATA[IDX|ORDER_ID|MALL_ID|MALL_USER_ID|ORDER_STATUS|USER_ID|USER_NAME|USER_TEL|USER_CEL|RECEIVE_TEL|RECEIVE_CEL|DELV_MSG|RECEIVE_NAME|RECEIVE_ZIPCODE|RECEIVE_ADDR|ORDER_DATE|PARTNER_ID|DPARTNER_ID|MALL_PRODUCT_ID|PRODUCT_ID|SKU_ID|P_PRODUCT_NAME|P_SKU_VALUE|PRODUCT_NAME|SALE_CNT|DELIVERY_METHOD_STR|DELV_COST|COMPAYNY_GOODS_CD|SKU_ALIAS|BOX_EA|MALL_ORDER_SEQ|MALL_ORDER_ID|ETC_FIELD3|ORDER_GUBUN|P_EA|REG_DATE|ord_field2|copy_idx|ORD_CONFIRM_DATE|RTN_DT|CHNG_DT|DELIVERY_CONFIRM_DATE|CANCEL_DT|DELIVERY_ID|INVOICE_NO|HOPE_DELV_DATE|MODEL_NO|ETC_MSG|DELV_MSG1|MUL_DELV_MSG|FREE_GIFT|ACNT_REGS_SRNO|MODEL_NAME]]></ORD_FIELD>
    <ORDER_STATUS>${orderStatus}</ORDER_STATUS>
    <LANG>UTF-8</LANG>
  </DATA>
</SABANG_ORDER_LIST>`;

  return new Response(xmlContent, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}