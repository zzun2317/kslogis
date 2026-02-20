import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. .env.local 파일을 확인하세요.");
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export async function POST(req: Request) {
  try {
    // ✨ 프론트엔드 payload 구조 { user_id, json_data }에 맞춰 분리해서 받음
    const { json_data, user_id } = await req.json();

    /**
     * 🚀 트랜잭션 처리 (RPC 호출)
     * p_json_data: 엑셀 데이터
     * p_user_id: 로그인한 사용자의 ID (cust_register 컬럼용)
     */
    const { error } = await supabase.rpc('process_excel_upload', { 
      p_json_data: json_data,
      p_user_id: user_id 
    });

    // DB 함수 내부(RAISE EXCEPTION)에서 발생한 에러를 catch 블록으로 보냅니다.
    if (error) throw error;

    return NextResponse.json({ success: true, message: '저장 되었습니다' });

  } catch (error: any) {
    console.error('Save Transaction Error:', error);
    
    /**
     * 💡 [에러 메시지 처리]
     * DB에서 던진 커스텀 에러(품번 검증 등)가 있다면 해당 메시지를 보여줍니다.
     */
    const displayMessage = error.message 
      ? error.message 
      : '저장중 에러발생. 담당자에게 문의 바랍니다';

    return NextResponse.json(
      { error: displayMessage },
      { status: 500 }
    );
  }
}