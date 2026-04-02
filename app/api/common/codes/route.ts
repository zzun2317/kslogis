import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // 설정하신 supabase 클라이언트 경로

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mcode = searchParams.get('mcode');

  if (!mcode) {
    return NextResponse.json({ success: false, error: 'mcode가 필요합니다.' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl!, supabaseKey!);

  // ks_common 테이블에서 mcode가 '010'인 데이터를 comm_sort 순으로 조회
  const { data, error } = await supabase
    .from('ks_common')
    .select('*')
    .eq('comm_mcode', mcode)
    .eq('comm_use', true)
    .order('comm_sort', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}