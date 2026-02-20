// src/app/api/auth/login-check/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 전용 클라이언트 (Service Role Key 사용)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    // 1. 트리거가 생성해준 ks_users 테이블에서 유저 정보(Role 포함) 조회
    const { data: user, error } = await supabaseAdmin
      .from('ks_users')
      .select('*')
      .eq('user_email', email) // 회원가입 시 넣은 컬럼명 확인 필요!
      .single();

    if (error || !user) {
      return NextResponse.json({ message: '등록되지 않은 사용자입니다.' }, { status: 401 });
    }

    // 2. 권한 정보를 포함한 유저 데이터 반환
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json({ error: '서버 에러' }, { status: 500 });
  }
}