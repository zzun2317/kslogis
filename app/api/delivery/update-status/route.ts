// src/app/api/delivery/update-status/route.ts
import { NextResponse } from 'next/server';
import { sendAlimtalk } from '../../../../lib/notificationService';

export async function POST(request: Request) {
  try {
    // 1. 앱에서 보낸 데이터(body) 가져오기
    const body = await request.json();
    //console.log("📥 [Vercel API] 앱에서 받은 데이터:", body);
    const { 
      status, 
      phone, 
      name, 
      ordNo, 
      items, 
      driverName, 
      driverHp, 
      lat, 
      lng, 
      imageUrl,
      linkUrl,
      agentHp,
      agentName 
    } = body;

    // 2. 알림톡 발송 (START 또는 COMPLETE 상태일 때)
    // await를 붙이지 않고 백그라운드에서 실행하려면 .catch를 활용합니다.
    if (status === 'START' || status === 'COMPLETE') {
      // ✅ 모든 인자를 하나의 객체 { } 로 묶어서 전달합니다.
      await sendAlimtalk({
        status,
        phone,
        name,
        ordNo,
        items,
        driverName,
        driverHp,
        lat,
        lng,
        imageUrl,
        linkUrl,
      }).catch(err => console.error('🚀 알림톡 발송 실패:', err));

      if (agentHp && agentHp.length > 0) {
        // console.log(`🏪 [Vercel API] 매장용 알림톡 발송 시도: ${agentName} (${agentHp})`);
        
        await sendAlimtalk({
          status,
          phone,
          name,
          ordNo,
          items,
          driverName,
          driverHp,
          lat,
          lng,
          imageUrl,
          linkUrl,
          agentHp,
          agentName
        }).catch(err => console.error('🚀 매장 알림톡 발송 실패:', err));
      }

    }

    // 3. 앱으로 즉각 응답 (알림톡 발송은 백그라운드에서 처리됨)
    return NextResponse.json({ 
      success: true, 
      message: '알림톡 발송 요청 완료' 
    });

  } catch (error: any) {
    console.error('Update Status API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: '서버 내부 오류 발생' 
    }, { status: 500 });
  }
}