import { NextResponse } from 'next/server';

// 개발 전용 화면과 API는 운영 환경에서 렌더링·호출 전에 차단합니다.
export function proxy() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dev/care-completion/:path*', '/dev/ai-mind/:path*', '/api/dev/ai-mind/:path*'] };
