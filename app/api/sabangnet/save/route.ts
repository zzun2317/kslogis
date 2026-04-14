import { createClient } from '@supabase/supabase-js'; // supabase 설정 경로
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
	console.error("❌ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. .env.local 파일을 확인하세요.");
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export async function POST(req: Request) {
  
  const { orders } = await req.json();

  try {
    // 1. 공통코드 '009' 데이터 미리 가져오기 (매핑용)
    const { data: commonCodes } = await supabase
      .from('ks_common')
      .select('comm_ccode, comm_text2')
      .eq('comm_mcode', '009');

    // 2. 사방넷 데이터와 공통코드 매핑 및 데이터 가공
    const insertData = orders.map((order: any) => {
			// const mallUserId = order.MALL_USER_ID ? String(order.MALL_USER_ID).trim() : '';
      const acntregssrno = order.ACNT_REGS_SRNO ? String(order.ACNT_REGS_SRNO).trim() : '';
      // MALL_USER_ID와 comm_text3 매칭 (대소문자 구분 없이 처리하려면 trim/toLowerCase 추천)
      const matched = commonCodes?.find((c) => {
			// const commonText3 = c.comm_text3 ? String(c.comm_text3).trim() : '';
      const commonText2 = c.comm_text2 ? String(c.comm_text2).trim() : '';
				// return commonText3 === mallUserId;
        return commonText2 === acntregssrno;
			});

      return {
        sabang_idx: order.IDX,
        raw_data: order, // 전체 데이터 압축 저장
        comm_ccode: matched ? matched.comm_ccode : null, // 매칭 실패 시 null
        status: 'wait'
      };
    });

    // 3. Upsert 실행 (중복된 sabang_idx가 있으면 업데이트)
    const { error } = await supabase
      .from('temp_sabang_order')
      .upsert(insertData, { onConflict: 'sabang_idx' });

    if (error) throw error;

    return NextResponse.json({ success: true, count: insertData.length });
  } catch (error: any) {
    console.error('저장 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}