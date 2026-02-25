// 대시보드 그래프 생성 Recharts
'use client';

import { 
  // 1, 2번용 (원형)
  PieChart, Pie, Cell, 
  // 3, 4, 5번용 (막대)
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  // 공통
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useEffect, useState } from 'react';

export default function DeliveryStatusChart({ data }: { data: any[] }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 마운트 전이거나 데이터가 없으면 빈 화면(또는 스켈레톤) 표시
  if (!isMounted || !data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm italic">
        {data?.length === 0 ? "데이터가 없습니다." : "그래프 로딩 중..."}
      </div>
    );
  }

  return (
    // minWidth를 0으로 설정하여 계산 오류 방지
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={5}
          dataKey="value"
          // TypeScript 에러 방지를 위한 방어 코드 추가
          label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          isAnimationActive={true} // 애니메이션 활성화
        >
          {data.map((entry, index) => (
            // 뷰에서 가져온 status_color(또는 color로 매핑한 값)를 사용
            <Cell key={`cell-${index}`} fill={entry.color || '#cccccc'} />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ 
            borderRadius: '8px', 
            border: 'none', 
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
          }} 
        />
        <Legend verticalAlign="bottom" iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}