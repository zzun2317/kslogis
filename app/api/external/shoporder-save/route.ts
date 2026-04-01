import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  // 1. 환경 변수 체크
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, message: '서버 환경 설정 오류' }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const dataList = await req.json();

    if (!dataList || dataList.length === 0) {
      return NextResponse.json({ success: false, message: '저장할 데이터가 없습니다.' });
    }

    // temp_sabang_order 테이블에 맞게 데이터 매핑
    // temp_seq는 DB에서 자동생성(Identity)된다면 제외하고, 아니라면 로직 추가 필요
    const { error } = await supabase
      .from('temp_sabang_order')
      .upsert(dataList, { 
        onConflict: 'sabang_idx',
        ignoreDuplicates: false // false가 기본값이며, 중복 시 업데이트를 수행합니다.
      });

    // 대량 인서트 (Chunking이 필요할 정도로 많다면 분할 처리 권장)
    if (error) {
      console.error('Supabase Insert Error:', error);
      return NextResponse.json({ success: false, message: `DB 저장 오류: ${error.message}` }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `${dataList.length}건이 임시 테이블에 저장되었습니다.` 
    });
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}